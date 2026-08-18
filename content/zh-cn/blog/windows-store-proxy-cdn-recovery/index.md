---
title: "修复商店下载：对齐服务代理并拆分 CDN 路径"
date: 2026-08-18
draft: false
tags: ["windows", "proxy", "winhttp", "delivery-optimization", "troubleshooting"]
categories: ["DevOps"]
description: "商店目录可访问但安装失败时，先对齐服务代理，再单独测量内容路径，只恢复已经证实卡住的下载项。"
---

Windows Store 的商品页可以正常打开，开始安装时却只显示通用的稍后重试。前台应用与安装服务读取了不同的网络状态：桌面会话使用当前可用的本地代理，服务级 WinHTTP 配置仍指向已经没有监听进程的旧回环端点。

对齐代理后，目录与许可请求恢复，随后又出现了独立故障：大文件下载长时间停在同一字节数，而对实际内容主机进行直连和代理测速都很快。最终处理把两段故障分开，允许微软大文件 CDN 直连，并只重建已经证实卡住的 Delivery Optimization 下载项。安装包随后完成下载与部署，系统始终没有开启全局 TUN。

## 目录可用无法证明安装路径可用

通用错误很容易让人直接重置 Store。这样会在定位失败边界前修改缓存、包注册与账号状态。本次先对比了三个网络使用者：

| 使用者 | 作用 | 相关状态 |
| --- | --- | --- |
| Store 前台 | 展示目录与商品页 | 当前用户代理 |
| 安装服务 | 获取目录与许可数据 | 机器级 WinHTTP 代理 |
| Delivery Optimization | 传输大文件内容 | WinHTTP 策略、CDN 路由与任务状态 |

微软把 WinHTTP 定位为适合服务使用的 HTTP 接口，并说明它不会共享浏览器的 cookie、缓存或凭据；WinINet 会为桌面应用继承用户 Internet Options 配置（[WinHTTP 说明](https://learn.microsoft.com/en-us/windows/win32/winhttp/about-winhttp)、[WinINet 说明](https://learn.microsoft.com/en-us/windows/win32/wininet/about-wininet)）。因此，浏览器或 Store 页面可访问，只能证明前台路径在当时可用，无法替代服务 WinHTTP 的检查。

事件时间线给出了直接证据：安装服务通过旧回环代理连接失败；使用当前正在监听的代理访问同类目录请求则成功。Store 包、许可服务和应用容器环回豁免均保持正常。

这些证据只支持一项范围明确的初始修改：让 WinHTTP 使用当前本地代理，同时保留既有绕过规则。重新注册全部 Store 包、修改区域、清空全部缓存或启用全局隧道都缺少证据基础。

## 显式读取并修改服务代理

Windows 通过 `netsh` 暴露 WinHTTP 的有效配置。微软文档把 `show proxy`、`set proxy`、`import proxy` 和 `reset proxy` 定义为不同操作（[netsh winhttp](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/netsh-winhttp)）。第一步只读检查当前值：

```powershell
netsh winhttp show proxy
```

配置格式正确仍不代表端点可用，还要检查对应本地端口是否有监听者。本次旧端点没有监听进程，当前端点能够建立连接，并让目录请求返回成功。

修复使用提权后的显式 `set proxy`，其通用形式如下：

```powershell
netsh winhttp set proxy `
  proxy-server=loopback:port `
  bypass-list="localhost;<local>"
```

实际端点应从当前状态发现，不能写入公开日志。受管环境可以选择导入用户代理，但导入动作是否保留服务所需的精细绕过列表，需要单独核对。

修改后重新读取 WinHTTP，确认它已经使用有监听者的端点。用户代理、本地代理客户端、环回豁免与 TUN 状态均未变化。新的 Store 请求越过了先前的连接失败，并进入下载阶段。

## 把慢速传输作为第二段故障

目录边界恢复后，安装仍未完成。传输只增长到一个很小的固定片段，之后多次请求持续复用同一下载项和相同字节数。

排查同时对比三项信号：

1. 从实际微软内容主机执行小范围直连测速；
2. 对同一地址通过当前本地代理执行等量测速；
3. 观察 Delivery Optimization 下载项的实时进度和连接活动。

直连与代理测速结果接近，均达到健康吞吐；后台下载项没有继续增长，一度也没有外部传输连接。带宽策略检查没有发现严格的前台限速。组合证据排除了普遍的运营商带宽故障，并把调查范围收敛到卡住的下载项。

微软建议在 Store 下载排查中运行 `Get-DeliveryOptimizationStatus`，并检查下载模式、云服务可达性以及对等或内容活动（[Delivery Optimization 故障排查](https://learn.microsoft.com/en-us/windows/deployment/do/delivery-optimization-troubleshoot)）：

```powershell
Get-DeliveryOptimizationStatus
```

不同 Windows 版本提供的字段可能不同，命令也可能需要管理员 PowerShell。应重点读取状态、文件大小、HTTP 与对等字节计数以及连接活动。检查目标保持一致：唯一定位某个文件项，确认接收字节是否增长，再把该状态与真实连接和事件时间对齐。

## 分开目录控制流量与大文件内容流量

最终路由策略让 Store 目录和许可请求继续使用本地代理，同时允许文档中对应的微软下载 CDN 类别直连。控制请求保留了已经验证的可达路径，大文件传输减少了一层本地转发。

这里还要考虑分段传输。微软说明 Windows Update 下载会使用 HTTP Range 请求，路径中的代理需要允许分段请求（[Windows Update 代理故障排查](https://learn.microsoft.com/en-us/troubleshoot/windows-client/installing-updates-features-roles/windows-update-issues-troubleshooting)）。小请求成功与长时间续传稳定属于两项不同证据。针对真实内容主机分别测量两条路径，比只看一个 HTTP 成功状态更可靠。

新路由生效后，受控刷新 Delivery Optimization 与安装队列属于可恢复操作，但下载仍复用了原有冻结片段。这项结果继续缩小了范围：剩余故障落在下载项状态，也避免把“代理配置已更新”误报为完整修复。

## 只恢复已经证实的下载项

最后一步只针对唯一下载项。操作前已经确认它的标识、总大小、已缓存字节数以及多次不增长的状态。流程移除该项的临时片段，再重新提交同一安装请求；其他 Store 应用与 Windows Update 内容保持不变。

全局重置 Store 或清空整个 Delivery Optimization 缓存会丢失诊断证据，也可能中断无关下载。项目级清理同样需要严格边界：在受控操作中停止相关服务，确认目标属于失败请求，只移除已经验证的临时状态，并在重新提交前确认各项服务回到预期运行状态。

下载项重建后，接收字节立即越过此前固定上限。持续吞吐接近前面的路径测速结果，流程随后从下载进入部署。包管理器返回成功，已安装包状态健康，Store 完成事件也返回零结果码。

## 验证覆盖每一个变化边界

最终验收没有停在进度条开始移动，还包括：

- WinHTTP 回读显示当前服务代理与预期 CDN 绕过项；
- 旧连接错误在修复后没有再次出现；
- 重建后的下载项越过原固定字节数，并持续产生传输；
- 安装包完成部署且状态健康；
- Store 完成事件返回成功；
- 用户代理与应用容器环回豁免保持不变；
- 本地代理进程没有重启，也没有启用全局隧道适配器。

这组检查分别证明配置正确、传输恢复、安装完成和修改范围受控。任何更早的单项信号都无法覆盖其余故障类型。

## 适用边界

这套方法适用于证据指向过期服务代理，或某个 Delivery Optimization 下载项持续复用冻结状态的场景。企业 PAC、认证代理、TLS 检查、终端安全软件、MDM 策略、按流量计费网络和对等缓存策略也可能产生相似症状，需要按各自边界排查。受管设备直接绕过 CDN 还可能违反组织网络策略，实施前必须确认权限与要求。

签名下载 URL、本地代理端点、账号标识、包身份和缓存路径都不应进入工单或公开文章。签名 URL 具有临时凭据属性，本机路径也可能暴露个人或组织信息。

可复用的排查顺序是清点每个网络使用者，对齐过期的服务状态，分别测量控制流量与内容流量，观察下载项级别的真实增长，再执行证据支持的最小恢复。商品页可用、探测请求成功、进度条移动和安装完成分别对应不同边界。
