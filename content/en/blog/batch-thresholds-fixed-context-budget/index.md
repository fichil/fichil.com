---
title: "Why Batch Thresholds Do Not Reduce Token Use by Themselves"
date: 2026-11-06
publication_date: 2026-11-06
slug: "batch-thresholds-fixed-context-budget"
draft: false
tags: ["llm", "batch-processing", "token-budget", "message-queues", "reliability", "testing"]
categories: ["Engineering"]
description: "Make high-volume model calls efficient by budgeting repeated context, limiting raw media without dropping text, and committing message consumption only with an accepted result."
ai:
  schema_version: 1
  problem: "A message processor used a large trigger threshold, yet independent media limits and repeated fixed context fragmented the work into many expensive model calls."
  symptoms:
    - "Reducing the number of messages in a batch could not fix an input failure because instructions, profile data, and retained memory already exceeded the old text budget."
    - "A media attachment limit caused a large pending set to be processed in several small calls even when the configured trigger threshold was much larger."
    - "Long retained memory was sent again with every small call, and capacity failures could repeat with the same effective request."
  evidence:
    - "A sanitized reconstruction measured 69,484 bytes of fixed text before any new message, above the former 65,536-byte input limit."
    - "A controlled batch containing 238 pending entries had previously produced fourteen successful calls dominated by four raw media attachments per call."
    - "Synthetic tests verified that 99 ordinary messages did not trigger a call, the 100th formed one normal-budget request, and 59 ordinary messages plus one explicit trigger formed one 60-message request."
    - "A controlled maintenance run backed up retained memory, reduced it from 22,806 to 2,532 characters in one model call, and left delivery records and profile data unchanged."
  root_cause: "The system treated the trigger count as its batch size even though fixed context, raw-media selection, message inclusion, memory growth, and retry policy imposed separate boundaries."
  resolution_steps:
    - "Measure fixed and variable request parts separately, with independent input, output, and full-body limits."
    - "Select the complete ordered message batch first, then choose a bounded set of raw media while preserving placeholders for every remaining attachment."
    - "Snapshot batch membership so arrivals during a request remain pending for the next batch."
    - "Commit accepted memory, generated output, and consumption markers together; failed or omitted messages remain pending."
    - "Bound retained memory and stop deterministic capacity failures from retrying the same request repeatedly."
  verification:
    - "Synthetic scenarios covered 99 and 100 messages, an explicit-trigger batch, more than four media items, concurrent arrivals, restart, conflict, failure, and duplicate synchronization."
    - "The completed change passed 426 backend tests, 54 reader tests, 44 frontend unit tests, and 56 browser tests."
    - "Protected CI and a controlled production deployment completed successfully while the selected conversation remained disabled for live replies."
  limitations:
    - "The final live check verified request construction, memory compression, persistence, and deployment, but did not enable the selected conversation or send a new message."
    - "The test evidence does not establish one universal token-saving percentage; message length, retained context, media, model behavior, and cache accounting still vary."
    - "The chosen byte and memory limits belong to one verified implementation and should be measured again for another protocol or model."
  applies_to:
    - "high-volume chat or event processors that call a language model"
    - "pipelines that combine retained memory, media attachments, and ordered message consumption"
    - "systems where deterministic capacity errors must not trigger repeated paid requests"
  keywords: ["batch threshold", "fixed context", "token budget", "media placeholder", "atomic consumption"]
---

A message processor was configured to wait for many new entries before calling a language model. The threshold suggested that a busy conversation would be handled in a small number of large requests. Runtime evidence showed a different pattern: raw-media limits produced several small calls, while nearly the same instructions, profile data, and retained memory were sent every time.

One failure made the hidden cost visible. A sanitized reconstruction contained 69,484 bytes of fixed text before adding a new message. The old input limit was 65,536 bytes. Shrinking the message batch could not make that request fit because the variable part was not the cause.

The repair defined batch formation from the effective request. It measured repeated context, selected messages independently from raw media, bounded retained memory, and moved consumption markers into the same commit as the accepted result.

## A trigger threshold is only one boundary

The configured threshold answered one question: when may automatic processing start? It did not answer how many messages the request would contain.

The earlier path also had limits for message count, raw images, text bytes, full request size, and generated output. Media selection happened too early. Once four raw attachments filled the media allowance, the request stopped growing even when later entries were plain text.

A controlled record showed 238 pending entries producing fourteen successful calls dominated by four media items per call. The large trigger threshold still controlled when work began, but it did not determine the effective batch size.

The repeated portion of a model request can be substantial:

```text
effective input
├── system contract and global instructions
├── profile or policy data
├── retained memory
├── ordered new messages
└── selected raw media
```

When the first three sections dominate the input, splitting the last two sections can increase total usage. Every additional call pays for the repeated portion again.

## Measure fixed and variable input separately

The implementation now computes the serialized size of each request component. Input text, validated output, and the complete request body use separate limits because they protect different resources.

The verified configuration raised the text-input allowance to 256 KiB while keeping the validated output at 64 KiB and the complete request body at 20 MiB. These values are implementation evidence, not universal recommendations. Their value came from making each boundary explicit and testing its actual serialized representation.

If fixed context alone exceeds the input budget, the task reports the fixed and variable sizes and stops before a model call. Removing one message at a time would only repeat local work and eventually produce the same failure.

The same distinction applies to output. A model may accept a large input and still truncate the structured result. The completed change kept output validation independent and used a larger generation allowance only for configurations that had been verified to support it.

## Include messages before choosing raw media

Message inclusion and raw-media attachment are now two separate decisions.

First, the processor snapshots every eligible pending message in order. An explicit trigger can promote the current pending set, while an ordinary conversation still waits for its configured count. Messages arriving after the snapshot remain pending for the next request.

Second, the processor chooses up to four relevant raw media items from that fixed message set. Every other image or sticker keeps its position and a text placeholder. Exhausting the raw-media allowance no longer removes later text from the request.

This structure preserves the causal order of the conversation without forcing every attachment into the model body. A later request can attach a previously represented image when a new message explicitly refers to it and the source remains available.

## Consume messages only with the accepted result

Selecting a batch does not mean that its messages have been processed.

The request records the selected message IDs and content fingerprints together with the memory revision, profile revision, and instruction snapshot. If a message changes or new entries arrive while the model is running, the old request cannot consume the new state.

After the result passes structural validation, one transaction saves the new retained memory, the generated reply or empty reply, the completed task record, and the consumption markers for the exact input fingerprints. A conflict, failed call, invalid result, or interrupted process leaves those messages pending.

This boundary also protects retries. A restart can inspect committed state and continue unfinished work without marking an omitted message as complete or generating the same delivery twice.

## Bound retained memory and classify retryable failures

Retained memory had grown to 22,806 characters. Sending it with every fragmented request multiplied both input and output work because each result returned another complete memory value.

The updated contract targets 3,000 characters and enforces a 4,000-character limit while preserving relationships, preferences, agreements, open tasks, and recent topics. A controlled maintenance command backed up the original value and reduced it to 2,532 characters in one model call. It did not alter profile data, prior rounds, or delivery records.

Capacity failures now follow a bounded path. An input that cannot fit reports its measured components before a provider call. A truncated or oversized result may use one verified compatible configuration. The processor does not repeat the same deterministic capacity error through a general network-retry loop. Temporary network and service failures retain their separate backoff policy.

## Verify request shape and state transitions

Synthetic tests covered the boundaries that had defeated the original threshold:

- 99 ordinary messages did not start a call;
- the 100th message formed one normal-budget request containing all 100;
- 59 ordinary messages plus one explicit trigger formed one 60-message request;
- more than four media entries preserved every message while attaching at most four raw files;
- arrivals during a request remained pending for the next batch;
- failure, restart, duplicate synchronization, and state conflict did not consume or resend the wrong messages.

The completed change passed 426 backend tests, 54 reader tests, 44 frontend unit tests, and 56 browser tests. Protected CI and the production deployment completed successfully. The selected live conversation remained disabled, so the final check verified deployment, stored state, and one controlled memory compression without creating a new external reply.

## Limits and reusable conclusion

The evidence proves the repaired boundaries and the controlled maintenance result. It does not prove a fixed token-saving percentage. Real usage still depends on message length, retained context, media content, provider accounting, cache behavior, and generated output.

An effective batch threshold needs an effective-request budget. Measure the repeated context, snapshot ordered messages before selecting raw media, keep arrivals outside the active batch, commit consumption with the accepted result, and bound memory and retries. That design turns a visible threshold into a property the runtime can actually enforce.
