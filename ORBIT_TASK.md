# Add cursor and agy adapters to trajectory

Normalize cursor-agent and agy transcripts into trajectory format.

- cursor: SQLite-based session store at ~/.cursor/chats
- agy: Print mode output (capture STDOUT as JSONL)

Tasks:
1. Add cursor adapter (read SQLite blobs table)
2. Add agy adapter (parse print-mode output)
3. Update exports and index
4. Add tests for both adapters
