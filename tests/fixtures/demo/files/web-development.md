# Web Development
## Request cancellation
Use an AbortController to cancel a request. Check the signal before updating the view. Keep a useful retry action when the server is unavailable.
```ts
const controller = new AbortController();
fetch('/api/source', { signal: controller.signal });
controller.abort();
```
## Source previews
Treat uploaded HTML as data. Render extracted text as text rather than inserting HTML. Display original document locations alongside citations.