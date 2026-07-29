(async function(){
  const infoEl = document.getElementById('info');
  const devicesEl = document.getElementById('devices');
  const eventsEl = document.getElementById('events');

  const info = await window.paperbox.invoke('app:get-info');
  infoEl.textContent = `${info.name} — v${info.version}`;

  function addEvent(s){ eventsEl.textContent = `${new Date().toISOString()} - ${s}\n` + eventsEl.textContent }

  window.paperbox.on('device-found', (_e, d) => {
    addEvent('Device found: ' + JSON.stringify(d));
    const li = document.createElement('li');
    li.textContent = d?.name || d?.id || JSON.stringify(d);
    devicesEl.appendChild(li);
  });

  window.paperbox.on('upload-progress', (_e, p) => addEvent('Upload: ' + JSON.stringify(p)));

  addEvent('Renderer ready');
})();
