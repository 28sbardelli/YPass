(function () {
  if (!window.io) {
    return;
  }

  const socket = window.io('/', { transports: ['websocket'] });
  socket.on('teacher-pass-requested', function () {
    window.location.reload();
  });
})();