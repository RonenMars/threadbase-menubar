# Logs Viewer Feature

This document describes the new Logs Viewer feature added to the Threadbase Menubar application.

## Overview

The Logs Viewer is a new window in the menubar app that displays real-time logs from the Threadbase Streamer application. It provides a clean, VS Code-inspired interface for viewing and filtering logs.

## Features

### Log Display
- **Real-time updates**: Polls the tb-streamer API every 2 seconds for new logs
- **Auto-scroll**: Automatically scrolls to show the latest logs (can be toggled off)
- **Color-coded entries**: Different colors for debug, info, warn, and error levels
- **Timestamp display**: Shows the time of each log entry
- **Component information**: Displays the component that generated each log

### Filtering
- **Level filter**: Filter logs by level (all, debug, info, warn, error)
- **Log count**: Shows the number of currently displayed logs

### Controls
- **Refresh**: Manually refresh the logs
- **Clear**: Clear all displayed logs
- **Close**: Close the logs window

## Architecture

### tb-menu Changes (in worktree `feature/logs-viewer`)

1. **New Files**:
   - `src/logs-viewer/index.html`: Logs viewer HTML structure
   - `src/logs-viewer/styles.css`: Dark-themed CSS styling
   - `src/logs-viewer/logs-viewer.js`: Client-side logic for fetching and displaying logs

2. **Modified Files**:
   - `src/main.ts`: Added logs window creation and management
   - `src/preload.ts`: Added IPC APIs for opening logs window
   - `src/renderer/index.html`: Added "View Logs" button
   - `src/renderer/renderer.js`: Added event handler for logs button
   - `src/renderer/styles.css`: Updated styling for two-button footer
   - `scripts/copy-renderer.mjs`: Updated to copy logs-viewer files

### tb-streamer Changes

1. **New Files**:
   - `src/api/routes/logs.routes.ts`: API endpoint for serving logs

2. **Modified Files**:
   - `src/api/app.ts`: Registered the logs routes

## API Endpoint

**GET** `/api/logs`

Query Parameters:
- `limit` (optional): Number of log entries to return (default: 100)

Response:
```json
{
  "logs": ["log line 1", "log line 2", ...],
  "count": 50,
  "total": 1000
}
```

The endpoint reads from `~/.threadbase/logs/dev.log` and returns the most recent entries.

## How to Use

1. **Open the menubar**: Click the Threadbase icon in your system tray/menubar
2. **View Logs**: Click the "View Logs" button at the bottom of the popup
3. **Filter logs**: Use the level dropdown to filter by log level
4. **Auto-scroll**: Toggle auto-scroll on/off as needed
5. **Clear logs**: Click the trash icon to clear the current view
6. **Refresh**: Click the refresh icon to manually update logs

## Development

### Building
```bash
npm run build
```

This will:
1. Compile TypeScript files
2. Copy renderer files to `dist/renderer/`
3. Copy logs-viewer files to `dist/logs-viewer/`

### Running
```bash
npm start
```

### Testing
Ensure tb-streamer is running on the configured port (default: 8766) for logs to be fetched.

## Technical Details

### Log Polling
- Polls every 2 seconds
- Maintains a maximum of 1000 logs in memory
- Parses JSON log lines from pino logger format
- Falls back to plain text if JSON parsing fails

### Window Management
- Logs window is reused if already open (focused instead of recreated)
- Window can be resized (minimum 600x400)
- Properly cleaned up when closed

### Error Handling
- Connection status indicator shows if tb-streamer is reachable
- Graceful degradation when logs file doesn't exist
- Timeout after 5 seconds for fetch requests

## Future Enhancements

Possible improvements:
- Search functionality
- Export logs to file
- Follow mode (like `tail -f`)
- WebSocket-based real-time streaming
- Persistent log history
- Log highlighting/syntax highlighting for structured data

## Live Mode Details

The logs viewer operates in **live mode** with the following behavior:

### How Live Mode Works

1. **Polling**: Fetches logs from `/api/logs` every 2 seconds
2. **Deduplication**: Tracks previously seen logs using a unique key (`timestamp:message:level`)
3. **Incremental Updates**: Only appends new logs that haven't been displayed before
4. **Memory Management**: Keeps a maximum of 1,000 logs in memory
5. **Auto-scroll**: Automatically scrolls to show new logs as they arrive (toggleable)

### Connection Status

- **Connected (Live)**: Successfully fetching logs from tb-streamer
- **Disconnected**: Cannot reach tb-streamer API (will retry automatically)

### Limitations

- Logs are fetched via HTTP polling, not WebSocket streaming
- 2-second delay between updates (configurable via `POLL_INTERVAL`)
- Deduplication is based on `time:msg:level` combination (logs with identical content at the same timestamp will be deduplicated)

### Why Not WebSocket?

The current implementation uses HTTP polling for simplicity. Future versions could implement WebSocket-based streaming for true real-time updates with zero delay.
