---
title: "Why Order Creation Times Were 14 Hours Early: Verify the JDBC Write Boundary"
date: 2026-11-27T09:10:00+08:00
publication_date: 2026-11-27
slug: "jdbc-timezone-write-boundary"
draft: false
tags: ["Java", "MySQL", "JDBC", "Time Zones", "Data Repair"]
categories: ["Backend Engineering"]
description: "Reproduce a creation-time offset with the deployed MySQL driver, verify the packaged connection settings, and repair affected historical rows in a guarded transaction."
ai:
  schema_version: 1
  problem: "Orders were created in a test environment, but their stored creation times were 14 hours earlier than the corresponding intake times."
  symptoms:
    - "The database already held the shifted value, and the list showed that value."
    - "The first repair passed verification. A later release replaced the corrected connection configuration."
  evidence:
    - "A read-only comparison using the deployed connection and Connector/J 8.0.20 showed CST interpreted as North American Central time. An explicit Shanghai time zone removed the offset."
    - "Follow-up probes reproduced a 14-hour winter offset and a 13-hour summer offset."
  root_cause: "The writer let the driver infer an ambiguous time zone, and the release process did not validate the connection settings in the deployment packages."
  resolution_steps:
    - "Set an explicit JDBC connection time zone on both intake paths. Align the running configuration, deployment packages, and release configuration source."
    - "Check the resolved connection configuration inside the packages before stopping the service."
    - "Repair identified historical rows in one transaction and preserve later business modification times."
  verification:
    - "Probe current, cross-midnight, and summer values with the deployed driver and connection settings. Read back the repaired history and order list."
  limitations:
    - "Verification covered development and test environments. Read-only parameter probes checked conversion without creating a new order."
  applies_to:
    - "Java services that use Connector/J and render their MySQL connection settings during release."
  keywords: ["JDBC", "Connector/J", "serverTimezone", "parameter binding", "historical data repair"]
---

An order arrived successfully in a test environment, but the order list put its creation time 14 hours earlier than the intake log. The database held the same early timestamp. That narrowed the investigation to how the time was written.

The first repair passed both driver and order-query checks. A later release replaced the corrected settings and brought the offset back. The second repair therefore checked what the deployment package actually handed to the driver.

## Reproduce the conversion with the deployed driver

The service reached MySQL through JDBC, Java's database access API. We took the deployed driver, Connector/J 8.0.20, and ran a read-only comparison with the service's connection settings. We bound the same time as a query parameter in each trial so we could see what the driver sent without creating an order.

The intake service let the driver interpret the database's `CST` abbreviation. In this setup the driver interpreted it as North American Central time. Its winter offset was UTC−6, while the application used Shanghai time at UTC+8. The resulting conversion sent a value 14 hours earlier than expected. A separate service connection already configured for Shanghai showed no offset. Adding `serverTimezone=Asia/Shanghai` to the intake probe produced the same correct result.

A follow-up check used a summer date and found a 13-hour difference with the original settings. That matters for historical repair. The proper correction depends on the affected date and the conversion that produced the stored value.

## Check the settings that ship

The two intake paths were a synchronous API and a message listener. The initial repair aligned their live JDBC configuration and deployment packages. When a subsequent release generated fresh connection settings from its environment configuration, the time-zone option was lost.

The follow-up fixed the environment configuration used at release time and checked both packages for the resolved time-zone setting before service shutdown. The package check saw the value after substitution, which a check of the source placeholder could not establish. After deployment, we exercised current, cross-midnight, and summer values again using the running driver and configuration.

Connection properties and conversion behavior depend on the driver version and the time types in use. For Connector/J 8.0.23 or later, consult the newer time-handling options and repeat the probe with the application's actual Java parameter and database column types. [MySQL Connector/J time handling documentation](https://dev.mysql.com/doc/connector-j/en/connector-j-time-instants.html)

## Repair only the history you can reconcile

The connection setting changes subsequent conversions. Existing rows needed a separate repair. We identified the affected order and detail rows, then locked and checked their original values in one transaction. We corrected each creation time by the verified difference. We shifted the modification time only when it still equalled the original creation time, preserving modification times from later business activity.

Before committing, we read back the corrected values and checked that non-time fields were unchanged. The before-state snapshot supported targeted recovery. The order query confirmed the corrected historical times, and the later repair was also checked in the actual list. The new conversion behavior was verified with read-only driver probes in development and test.

When an application shows the wrong time, trace one timestamp from intake through the deployed driver, its stored value, and the application query. Put a check at the first point where it changes and at any release step that can change that configuration again.
