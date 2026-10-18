# State and recovery

| State | Meaning | Automatic send allowed? |
| --- | --- | --- |
| `not-submitted` | No reservation, request or claim exists | First submission only, with existing user authorization |
| `pending` | Task registered durably, not yet claimed | Host may acquire the first exclusive claim |
| `submitted-awaiting-target` | Send returned; target history not yet verified | No |
| `unknown-do-not-replay` | Claimed task has uncertain delivery or incomplete state | No |
| `delivered-awaiting-ack` | Exact inbound envelope verified in target history | No |
| `acknowledged-awaiting-result` | Later visible ACK verified | No |
| `completed` | Later visible result marker/body verified | No; independent task acceptance still required |

The core separates registration, a permanent dispatch claim, transport response, target delivery, visible ACK, visible result and independent acceptance. It does not claim end-to-end exactly-once delivery.

Recovery reads the same operation and target. Do not clear claims or automatically create another ID. If state is ambiguous after a disk or host failure, inspect actual host history and let the owner decide the next action. File attachment acceptance and phone-side acceptance are separate from message state.

Bootstrap returns a small category map. Tool schemas are discovered for the task's relevant group, with an explicit online probe. An installed tool definition is not evidence that its backend is available.
