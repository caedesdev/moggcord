/* Copyright (c) 2026 Moggcord contributors. SPDX-License-Identifier: GPL-3.0-or-later */
(() => {
  'use strict';
  const base = 'http://127.0.0.1:6469';
  const documentation = 'https://github.com/caedesdev/moggcord/blob/codex/community-install-and-update-fix/docs/COMMUNITY-INSTALL.md';
  const pause = duration => new Promise(resolve => setTimeout(resolve,duration));
  async function request(route, options = {}, timeout = 5000) {
    const response = await fetch(base+route,{...options,credentials:'omit',signal:AbortSignal.timeout(timeout)});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Moggcord could not complete this installation.');
    return data;
  }
  async function install(data, progress = () => {}) {
    if (!data.install_manifest || !/^[a-f0-9]{64}$/.test(data.sha256 || '')) return false;
    let status;
    progress('Connecting to Moggcord…');
    try { status = await request('/v1/status',{},30000); } catch { return false; }
    if (status.name !== 'moggcord-community' || status.protocol !== 1) return false;
    const manifest = new URL(data.install_manifest,location.origin);
    if (manifest.origin !== location.origin || !/^\/api\/install\/[a-f0-9-]{36}$/.test(manifest.pathname)) throw new Error('Invalid installation link.');
    progress('Connecting to Moggcord…');
    const job = await request('/v1/install',{method:'POST',headers:{'Content-Type':'application/json','X-Moggcord-Install':'1'},body:JSON.stringify({manifest:manifest.href,sha256:data.sha256})});
    if (!/^[a-f0-9-]{36}$/.test(job.id || '')) throw new Error('Moggcord returned an invalid installation response.');
    for (let attempt=0; attempt<400; attempt++) {
      const current = await request(`/v1/jobs/${job.id}`);
      if (current.state === 'failed') throw new Error(current.message || 'Installation failed.');
      if (current.state === 'complete') { progress('Installed. Moggcord has been restarted.'); return true; }
      progress(current.message || 'Installing in Moggcord…');
      await pause(500);
    }
    throw new Error('Installation is taking longer than expected. Check Moggcord before trying again.');
  }
  function download(data) {
    const url = URL.createObjectURL(new Blob([data.source_code],{type:'text/plain;charset=utf-8'}));
    const link = document.createElement('a'); link.href=url;link.download=data.file_name;document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function connectionHelp(element,data,installed = false) {
    const row=document.createElement('p');row.className='installer-help';
    if (!installed) {
      row.append(document.createTextNode('File downloaded. Connect Moggcord for automatic installation and restart. '));
      const setup=document.createElement('a');setup.href=documentation;setup.target='_blank';setup.rel='noopener noreferrer';setup.textContent='Set up Moggcord';row.append(setup);
    } else row.append(document.createTextNode('Share this installation: '));
    if(data.install_manifest && /^[a-f0-9]{64}$/.test(data.sha256 || '')) {
      const link=new URL('moggcord://install');link.searchParams.set('manifest',new URL(data.install_manifest,location.origin).href);link.searchParams.set('sha256',data.sha256);
      const open=document.createElement('a');open.href=link.href;open.textContent='Open in Moggcord';row.append(document.createTextNode(installed ? '' : ' · '),open);
      const copy=document.createElement('button');copy.type='button';copy.className='installer-copy';copy.textContent='Copy install link';
      copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(link.href);copy.textContent='Link copied';}catch{copy.textContent='Could not copy link';}});
      row.append(document.createTextNode(' · '),copy);
    }
    element.hidden=false;element.append(row);
  }
  window.moggcordInstaller = Object.freeze({install,download,connectionHelp});
})();
