/* Copyright (c) 2026 Moggcord contributors. SPDX-License-Identifier: GPL-3.0-or-later */
((factory) => {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else globalThis.MoggcordPackage = factory();
})(() => {
  'use strict';
  const maxBytes = 10 * 1024 * 1024;
  const maxFiles = 256;
  const codeExtension = /\.(?:[jt]sx?)$/i;
  const textExtension = /\.(?:[jt]sx?|css|json|svg|md|txt)$/i;
  const error = code => Object.assign(new Error(code), {code});
  const validPluginName = name => typeof name==='string' && /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}$/.test(name) && !['constructor','prototype','__proto__'].includes(name);
  const pluginName = source => {
    const name=typeof source==='string' ? source.match(/definePlugin\(\{\s*(["'])?name\1:\s*(["'`])(.+?)\2/)?.[3] : null;
    return validPluginName(name) ? name : null;
  };
  function validPath(path) {
    return typeof path === 'string' && path.length <= 240 && path.split('/').every(part =>
      /^[A-Za-z0-9_@()+ .-]{1,120}$/.test(part) && !/[. ]$/.test(part) && !['.','..','node_modules','.git'].includes(part.toLowerCase()) &&
      !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) &&
      (textExtension.test(path) || /(?:^|\/)(?:LICENSE|LICENCE|NOTICE)$/i.test(path));
  }
  function validate(files, entrypoint) {
    if (!Array.isArray(files) || !files.length || files.length > maxFiles) throw error('file_count_invalid');
    const seen = new Set(); let size = 0;
    const result = files.map(file => {
      if (!file || Object.keys(file).some(key => !['path','content'].includes(key)) || !validPath(file.path)) throw error('file_path_invalid');
      const lower = file.path.toLowerCase();
      if (seen.has(lower)) throw error('file_duplicate');
      seen.add(lower);
      if (typeof file.content !== 'string' || file.content.includes('\0')) throw error('file_empty');
      size += new TextEncoder().encode(file.content).length;
      return {path:file.path,content:file.content};
    }).sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    if (size > maxBytes) throw error('file_too_large');
    for (const path of seen) for (const other of seen)
      if (other.startsWith(path + '/')) throw error('file_path_invalid');
    const entry = result.find(file => file.path === entrypoint);
    if (!entry || !codeExtension.test(entry.path) || !entry.content.trim()) throw error('entrypoint_invalid');
    const index=['index.ts','index.tsx'].find(path=>result.some(file=>file.path===path));
    if (index && index!==entrypoint) throw error('entrypoint_invalid');
    return {files:result,file_name:entrypoint,source_code:entry.content};
  }
  const canonical = (files, file_name) => JSON.stringify({file_name,files:validate(files,file_name).files});
  function zip(files, entrypoint) {
    const checked = validate(files,entrypoint); const encoder = new TextEncoder();
    const locals = [], central = []; let offset = 0, centralSize = 0;
    for (const file of checked.files) {
      const name = encoder.encode(file.path), content = encoder.encode(file.content);
      let crc = 0xffffffff;
      for (const byte of content) { crc ^= byte; for (let bit=0;bit<8;bit++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); }
      crc = (crc ^ 0xffffffff) >>> 0;
      const local = new Uint8Array(30+name.length), lv = new DataView(local.buffer);
      lv.setUint32(0,0x04034b50,true); lv.setUint16(4,20,true); lv.setUint16(6,0x800,true); lv.setUint16(12,33,true);
      lv.setUint32(14,crc,true); lv.setUint32(18,content.length,true); lv.setUint32(22,content.length,true); lv.setUint16(26,name.length,true); local.set(name,30);
      const directory = new Uint8Array(46+name.length), dv = new DataView(directory.buffer);
      dv.setUint32(0,0x02014b50,true); dv.setUint16(4,20,true); dv.setUint16(6,20,true); dv.setUint16(8,0x800,true); dv.setUint16(14,33,true);
      dv.setUint32(16,crc,true); dv.setUint32(20,content.length,true); dv.setUint32(24,content.length,true); dv.setUint16(28,name.length,true); dv.setUint32(42,offset,true); directory.set(name,46);
      locals.push(local,content); central.push(directory); offset+=local.length+content.length; centralSize+=directory.length;
    }
    const end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0,0x06054b50,true); ev.setUint16(8,checked.files.length,true); ev.setUint16(10,checked.files.length,true); ev.setUint32(12,centralSize,true); ev.setUint32(16,offset,true);
    const output = new Uint8Array(offset+centralSize+end.length); let position=0;
    for (const part of [...locals,...central,end]) {output.set(part,position);position+=part.length;}
    return output;
  }
  return Object.freeze({maxBytes,maxFiles,codeExtension,validPath,validate,canonical,zip,pluginName,validPluginName});
});
