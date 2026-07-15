# Cursor-Based Log Streaming

This document explains how the logs viewer implements efficient real-time log streaming using a cursor/offset-based approach.

## Architecture

### Problem with Previous Approach

The initial implementation used client-side deduplication:
- API always returned the last N logs
- Client maintained a Set of seen logs
- Required comparing timestamps and messages
- Inefficient: transferred duplicate data on every poll

### Cursor-Based Solution

The new implementation uses server-side cursor tracking:
- Each log line has an implicit ID (its line number/offset)
- Client tracks the current offset
- API only returns logs **after** the specified offset
- No deduplication needed - every fetch returns only new data

## API Specification

### GET /api/logs

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `since` | number | 0 | Line offset to fetch logs from (0 = initial load) |
| `limit` | number | 100 | Maximum number of logs to return |

**Response:**

```typescript
{
  logs: string[];           // Array of log lines (JSON strings)
  offset: number;           // Current offset (use for next request)
  total: number;            // Total number of logs in file
  hasMore: boolean;         // Whether more logs exist beyond current offset
  fileSize: number;         // Log file size in bytes
  fileModified: string;     // ISO timestamp of last modification
}
```

**Behavior:**

1. **Initial Load** (`since=0`):
   - Returns last `limit` logs from file
   - Sets `offset` to total line count
   
2. **Incremental Update** (`since=<offset>`):
   - Returns logs from line `offset` to `offset + limit`
   - Updates `offset` to new position
   
3. **No New Logs** (`since >= total`):
   - Returns empty `logs` array
   - Sets `offset` to current total

### GET /api/logs/meta

Get log file metadata without reading content.

**Response:**

```typescript
{
  exists: boolean;          // Whether log file exists
  total: number;            // Total number of log lines
  fileSize: number;         // File size in bytes
  fileModified: string;     // ISO timestamp of last modification
}
```

## Client Implementation

### Workflow

```
┌─────────────────────────────────────────────┐
│ 1. Initial Load                             │
│    GET /api/logs?since=0&limit=500          │
│    → Returns last 500 logs                  │
│    → offset = 1500 (if file has 1500 logs) │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 2. Wait 2 seconds...                        │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 3. Incremental Update                       │
│    GET /api/logs?since=1500&limit=500       │
│    → Returns logs from line 1500 onwards    │
│    → offset = 1523 (23 new logs)            │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 4. Repeat step 2-3 forever                  │
└─────────────────────────────────────────────┘
```

### State Management

```javascript
let currentOffset = 0;  // Track position in log file

async function fetchLogs() {
  const url = `${BASE_URL}/api/logs?since=${currentOffset}&limit=500`;
  const data = await fetch(url).then(r => r.json());
  
  if (data.logs.length > 0) {
    // Append new logs to display
    logs = [...logs, ...data.logs];
  }
  
  // Update offset for next fetch
  currentOffset = data.offset;
}
```

## Benefits

### Efficiency

| Metric | Old Approach | New Approach |
|--------|-------------|--------------|
| **Network** | Transfer last N logs every poll | Transfer only new logs |
| **Memory** | Maintain deduplication Set | Track single offset number |
| **CPU** | Hash and compare every log | No comparison needed |
| **Reliability** | Could miss logs if polling slow | Never misses logs |

### Example Scenario

**1000 logs in file, 2 new logs every 2 seconds:**

**Old approach:**
- Poll 1: Fetch 100 logs (100 lines)
- Poll 2: Fetch 100 logs (100 lines, 98 duplicates)
- Poll 3: Fetch 100 logs (100 lines, 96 duplicates)
- **Data transferred**: 300 lines for 6 new logs

**New approach:**
- Poll 1: Fetch 100 logs (100 lines, offset=1000)
- Poll 2: Fetch logs since 1000 (2 lines, offset=1002)
- Poll 3: Fetch logs since 1002 (2 lines, offset=1004)
- **Data transferred**: 106 lines for 6 new logs (71% reduction!)

## Edge Cases

### Log File Truncation

If the log file is truncated or rotated:
- Client offset becomes invalid (larger than file)
- API returns empty logs with new total
- Client could detect this and reset: `if (data.total < currentOffset)`

### Concurrent Viewers

Multiple clients can independently track their own offsets:
- Each client maintains its own `currentOffset`
- No server-side session state required
- Stateless API design

### Missing Logs

If logs are written between polls:
- They will be included in the next poll automatically
- Cursor-based approach never misses logs
- Unlike WebSocket, no special reconnection logic needed

## Future Enhancements

### 1. Backpressure Handling

If logs arrive faster than client can display:
```typescript
if (data.hasMore) {
  // Fetch next batch immediately without waiting
  fetchLogs();
}
```

### 2. Efficient File Reading

Currently reads entire file on every request. Could optimize:
- Cache file content and only read new bytes
- Use file watchers to detect changes
- Implement rotating log file support

### 3. WebSocket Upgrade

For zero-latency streaming:
```typescript
ws.send(JSON.stringify({ 
  type: 'subscribe', 
  since: currentOffset 
}));
```

### 4. Log Retention Window

Return only recent logs within a time window:
```typescript
GET /api/logs?since=1000&limit=500&after=2026-07-15T18:00:00Z
```

## Testing

### Manual Testing

1. Start with empty log file
2. Open logs viewer (should show "0 logs")
3. Generate logs in tb-streamer
4. Watch them appear in viewer automatically
5. Verify offset increases: check network tab (since parameter)

### Verification

```bash
# Monitor API requests
curl "http://localhost:8766/api/logs?since=0&limit=10"

# Check offset progression
curl "http://localhost:8766/api/logs?since=50&limit=10"

# Get metadata
curl "http://localhost:8766/api/logs/meta"
```

## Conclusion

Cursor-based streaming provides:
- ✅ Efficient network usage
- ✅ Simple implementation
- ✅ No missed logs
- ✅ Stateless server design
- ✅ Multiple concurrent viewers
- ✅ Predictable behavior

This approach scales well and provides a solid foundation for real-time log viewing without the complexity of WebSocket connections.
