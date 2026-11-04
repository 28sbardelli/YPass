const actionMessage = globalThis.document.querySelector('.teacher-action-message');

if (actionMessage) {
  globalThis.requestAnimationFrame(() => {
    actionMessage.classList.add('is-visible');
  });

  globalThis.setTimeout(() => {
    actionMessage.classList.add('is-dismissing');

    globalThis.setTimeout(() => {
      actionMessage.hidden = true;
    }, 350);
  }, 3000);
}