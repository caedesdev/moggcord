/* Copyright (c) 2026 Moggcord contributors. SPDX-License-Identifier: GPL-3.0-or-later */
(() => {
  'use strict';
  const base = 'http://127.0.0.1:6469';
  const documentation = 'https://github.com/caedesdev/moggcord/blob/main/docs/COMMUNITY-INSTALL.md';
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
    if (data.files && !status.capabilities?.includes('plugin-folders')) throw new Error('Update your Moggcord connector to install plugin folders automatically.');
    const manifest = new URL(data.install_manifest,location.origin);
    if (manifest.origin !== location.origin || !/^\/api\/install\/[a-f0-9-]{36}$/.test(manifest.pathname)) throw new Error('Invalid installation link.');
    progress('Connecting to Moggcord…');
    const job = await request('/v1/install',{method:'POST',headers:{'Content-Type':'application/json','X-Moggcord-Install':'1'},body:JSON.stringify({manifest:manifest.href,sha256:data.sha256})});
    if (!/^[a-f0-9-]{36}$/.test(job.id || '')) throw new Error('Moggcord returned an invalid installation response.');
    for (let attempt=0; attempt<400; attempt++) {
      const current = await request(`/v1/jobs/${job.id}`);
      if (current.state === 'failed') throw new Error(current.message || 'Installation failed.');
      if (current.state === 'complete') {
        window.dispatchEvent(new CustomEvent('moggcord:installationchange'));
        if (current.alreadyInstalled) { progress('Already installed. No changes were needed.'); return 'already-installed'; }
        progress('Installed. Moggcord has been restarted.'); return true;
      }
      progress(current.message || 'Installing in Moggcord…');
      await pause(500);
    }
    throw new Error('Installation is taking longer than expected. Check Moggcord before trying again.');
  }
  async function inspect(entries) {
    try {
      const status=await request('/v1/status',{},3000);
      if (status.name!=='moggcord-community' || status.protocol!==1 || !status.capabilities?.includes('installed-status')) return null;
      const valid=entries.filter(entry=>/^[a-f0-9-]{36}$/.test(entry.id || '') && ['plugin','theme'].includes(entry.kind));
      const results=[];
      for (let start=0;start<valid.length;start+=24) {
        const batch=valid.slice(start,start+24);
        const response=await request('/v1/installed',{method:'POST',headers:{'Content-Type':'application/json','X-Moggcord-Install':'1'},body:JSON.stringify({entries:batch.map(entry=>({id:entry.id,kind:entry.kind,file_name:entry.file_name,plugin_name:entry.plugin_name ?? null}))})});
        if (!Array.isArray(response.entries) || response.entries.length!==batch.length || response.entries.some(item=>!batch.some(entry=>entry.id===item.id) || typeof item.installed!=='boolean')) return null;
        results.push(...response.entries);
      }
      return results;
    } catch { return null; }
  }
  function watchButtons(bindings) {
    if (!bindings.length) return () => {};
    let stopped=false,ticket=0;
    const originals=new Map(bindings.map(({button})=>[button,{icon:button.querySelector('svg,i')?.cloneNode(true),label:button.getAttribute('aria-label'),title:button.title}]));
    async function refresh() {
      const current=++ticket;
      const results=await inspect(bindings.map(({entry})=>entry));
      if (stopped || current!==ticket) return;
      for (const {entry,button} of bindings) {
        const installed=results?.find(item=>item.id===entry.id)?.installed === true;
        button.dataset.installationState=results===null?'unknown':installed?'installed':'not-installed';
        button.dataset.installed=String(installed); button.classList.toggle('is-installed',installed);
        if (button.getAttribute('aria-busy')!=='true') button.disabled=installed;
        const label=button.querySelector('span'); if (label) label.textContent=installed?'Installed':'Download';
        button.setAttribute('aria-label',installed ? `${entry.name} is installed` : originals.get(button).label || `Download ${entry.name}`);
        button.title=installed ? 'Already installed in your connected Moggcord' : originals.get(button).title;
        const icon=button.querySelector('svg,i');
        if (installed && window.MoggUI?.createIcon) icon?.replaceWith(window.MoggUI.createIcon('check'));
        else if (originals.get(button).icon) icon?.replaceWith(originals.get(button).icon.cloneNode(true));
      }
    }
    window.addEventListener('focus',refresh);window.addEventListener('moggcord:installationchange',refresh);
    void refresh();
    return () => {stopped=true;ticket++;window.removeEventListener('focus',refresh);window.removeEventListener('moggcord:installationchange',refresh);};
  }
  function download(data) {
    const blob=data.files ? new Blob([window.MoggcordPackage.zip(data.files,data.file_name)],{type:'application/zip'}) : new Blob([data.source_code],{type:'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href=url;link.download=data.files ? `${(data.name || 'plugin').replace(/[^A-Za-z0-9_-]/g,'_')}.zip` : data.file_name;document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function connectionHelp(element,data,installed = false) {
    const toast = element.matches('[data-library-feedback], [data-profile-feedback]');
    if (!element.querySelector('.rr-alert__body') && window.MoggUI?.setAlert) window.MoggUI.setAlert(element, {
      tone:installed ? 'success' : 'info', title:installed ? 'Installed' : 'Downloaded',
      message:installed ? 'Moggcord has been restarted.' : 'File downloaded. Connect Moggcord for automatic installation.', toast
    });
    const row=document.createElement('p');row.className='installer-help';
    if (!installed) {
      const setup=document.createElement('a');setup.href=documentation;setup.target='_blank';setup.rel='noopener noreferrer';setup.textContent='Set up Moggcord';row.append(setup);
    }
    if(data.install_manifest && /^[a-f0-9]{64}$/.test(data.sha256 || '')) {
      const link=new URL('moggcord://install');link.searchParams.set('manifest',new URL(data.install_manifest,location.origin).href);link.searchParams.set('sha256',data.sha256);
      const open=document.createElement('a');open.href=link.href;open.textContent='Open in Moggcord';row.append(document.createTextNode(installed ? '' : ' · '),open);
      const copy=document.createElement('button');copy.type='button';copy.className='installer-copy';copy.textContent='Copy install link';
      copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(link.href);copy.textContent='Link copied';}catch{copy.textContent='Could not copy link';}});
      row.append(document.createTextNode(' · '),copy);
    }
    element.hidden=false;(element.querySelector('.rr-alert__body') || element).append(row);
  }
  window.moggcordInstaller = Object.freeze({install,download,connectionHelp,inspect,watchButtons});
})();
