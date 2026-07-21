---
title: "Company, Operating Organization, Project, and Warehouse in a Logistics Data Model"
date: 2026-07-09
lastmod: 2026-07-21
draft: false
tags: ["wms", "data-modeling", "sql", "multi-tenant", "logistics"]
categories: ["System Design"]
description: "A source-backed model of four ownership dimensions that are often confused in enterprise logistics applications."
---

Company, operating organization, project, and warehouse often appear together in login context, business documents, and query filters. They all seem to describe data ownership, but they represent different dimensions and should not be used interchangeably.

I derived their meaning from master-data tables, representative joins, and the values carried in a real user session rather than relying on field names alone.

## Company: the outer data boundary

A company or branch is the platform's broad isolation boundary. The org_id stored on business tables typically refers to the internal company identifier, not its display code.

Orders, inventory, and configuration queries commonly filter by org_id first. Projects, warehouses, and operating-organization nodes all belong to a company scope.

## Project: a business or operating engagement

The project identifier points to project master data. A project belongs to one company and often carries a default warehouse reference.

Business documents frequently store both org_id and project_id:

~~~text
org_id      isolates the company
project_id  selects a business project inside that company
~~~

Using the pair prevents cross-company access based only on a project number and supports several customer or operating projects within one company.

## Warehouse: the inventory and execution location

Warehouse master data stores the warehouse code and name and also belongs to a company. A project may bind to a warehouse, but the concepts remain different. The project describes business ownership; the warehouse describes inventory and operational space.

A representative lookup uses both the project's company and its warehouse code to resolve the warehouse, ensuring that the two records share the same company boundary.

## Operating organization: a hierarchy

The operating organization is represented by a separate station or organization table with codes, names, parent nodes, paths, and levels. Its hierarchy may contain company, site, and warehouse-level operating nodes.

This structure is useful for delegated permissions, operational reporting, and organizational navigation. Even when one node represents a warehouse-level organization, it is not the warehouse master record itself. One is a node in an organization tree; the other is an inventory and execution entity.

## The relationship in one view

~~~text
Company
├─ Project: business scope within the company
├─ Warehouse: inventory and execution location
└─ Operating organization: operational hierarchy
~~~

A project can bind to a warehouse, and the organization tree can contain warehouse-level nodes, but they remain separate dimensions. Business records are commonly isolated by org_id plus project_id, then narrowed by warehouse code or operating-organization node for execution and reporting.

Once these boundaries are explicit, authorization, inventory ownership, and report filters become easier to reason about. When historical comments disagree, inspect master tables, joins, and real SQL usage instead of trusting a label in isolation.
