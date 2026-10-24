/* BassCast SA offline page: retry button, and reload by itself when the connection returns. */
document.getElementById('retry').addEventListener('click', function () { location.reload(); });
addEventListener('online', function () { location.reload(); });
