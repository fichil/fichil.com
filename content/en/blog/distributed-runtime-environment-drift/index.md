---
title: "When a Local WMS Appears to Use Production Data"
date: 2026-07-03
draft: false
tags: ["java", "dubbo", "tomcat", "redis", "troubleshooting"]
categories: ["Backend Engineering"]
description: "A practical investigation of a local WMS whose JDBC data looked correct while login and permissions came from a different environment."
---

A local WMS instance had a JDBC configuration that clearly targeted a test database, yet its users, permissions, and parts of its UI behaved as if they came from another environment. Looking at one configuration file made it tempting to conclude that the application had silently switched databases.

The real explanation was more architectural. One web application depended on several independent sources:

- business records came through JDBC;
- authentication and authorization came from a remote user service;
- Dubbo provider addresses came from service discovery or cached metadata;
- Redis held session or permission-related state;
- multiple Tomcat instances on the workstation loaded different configuration directories.

A page can therefore show test business data while its identity context comes from an entirely different runtime.

## Identify the process that serves the request

The first step was not to edit another property. It was to map listening ports to process IDs, Java command lines, and Tomcat base directories. The browser port could belong to an older instance, while the process recently started from the IDE might serve another module.

This inspection showed that the web entry point and supporting services were separate Tomcat processes. Stopping the wrong process only removed the page endpoint; it did not fix the mixed environment.

Process-level evidence was more reliable than source-level assumptions. For every Java process I checked its actual startup arguments, loaded configuration location, and outbound connections.

## JDBC is only one dependency

After identifying the real web process, the investigation moved through each runtime dependency independently:

1. Confirm the JDBC URL and compare it with known business records.
2. Inspect the registry address and the Dubbo providers it resolves.
3. Check the Redis endpoint, namespace, and stale discovery data.
4. Verify the remote authentication and user-management service.
5. Review system properties and environment variables injected by the IDE.
6. Check Tomcat work directories for expanded applications or old external configuration.

Network connections provided especially strong evidence. The remote endpoints used by the running process described the effective environment more accurately than a property file in the repository.

## Recovery

The correct recovery path was to keep the Tomcat instance that actually provided the web entry point, then fix the registry, cache, and authorization dependencies it loaded. Any stale discovery state had to be isolated or cleared before restarting. Afterward, ports, process arguments, and outbound connections could verify that every dependency pointed to the intended environment.

The lesson is that a distributed application's environment is not a single database URL. It is a coordinated set of database, RPC, cache, and identity dependencies. When data and permissions disagree, draw the request path and prove each connection separately. Editing the most visible configuration file may leave the real split untouched.
