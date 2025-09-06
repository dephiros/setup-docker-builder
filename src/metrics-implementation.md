# V2 Metrics Implementation

This document describes the implementation of two new V2 metrics for the setup-docker-builder action.

## Implemented Metrics

### 1. BPA_V2_DEBUG_WORKERS_AVAILABLE_MS

- **Description**: Time taken (in milliseconds) for the `debug workers` command to become available after starting buildkitd
- **Type**: Integer (milliseconds)
- **When reported**: During builder startup, after buildkitd is started
- **Implementation**: Implemented in `setup_builder.ts` - tracks the time from when we start checking for workers until they become available
- **Protobuf enum value**: 7

### 2. BPA_V2_PRUNE_BYTES

- **Description**: Number of bytes pruned from the buildkit cache when running the prune command
- **Type**: Integer (bytes)
- **When reported**: During cleanup phase, when pruning the buildkit cache
- **Implementation**: Implemented in `setup_builder.ts` - parses the output of the `buildctl prune` command to extract bytes reclaimed
- **Protobuf enum value**: 8

## Status

✅ **COMPLETED** - Both metrics are now:

1. Added to the protobuf definition in `/Users/adityamaru/fa/agent/stickydisk/v1/stickydisk.proto`
2. Generated using `buf generate`
3. Integrated into the setup-docker-builder action in `main.ts`

## Implementation Details

### Debug Workers Metric

The `startAndConfigureBuildkitd` function now returns an object containing:

- `addr`: The buildkit daemon address
- `debugWorkersTimeMs`: Time taken for debug workers to become available

This metric helps track how quickly the buildkitd daemon becomes fully operational.

### Prune Bytes Metric

The `pruneBuildkitCache` function now:

- Returns the number of bytes pruned (or undefined if unable to parse)
- Includes a `parsePruneOutput` helper function that parses the prune command output
- Handles various output formats (KB, MB, GB, TB)
- Looks for "Total:" or "reclaimed" patterns in the output

This metric helps track the effectiveness of cache pruning and storage reclamation.

## Testing

Once the protobuf changes are in place:

1. Uncomment the metric reporting calls
2. Run the action with a builder that has cached data
3. Verify metrics are reported to the gRPC endpoint
4. Check that debug workers time is reasonable (typically < 5 seconds)
5. Verify prune bytes are correctly parsed and reported
