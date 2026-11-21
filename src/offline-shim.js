/* Offline storage layer: gives the dashboard the same db / user / assets calls it uses online,
   but keeps everything in this phone's IndexedDB. No network, no account. */
(function(){
"use strict";
window.OFFLINE=true;
const DBN="knowing-to-doing", VER=1;
let idb=null;
function openIdb(){return new Promise((res,rej)=>{const r=indexedDB.open(DBN,VER);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains("kv"))d.createObjectStore("kv");if(!d.objectStoreNames.contains("blobs"))d.createObjectStore("blobs");};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
function tx(store,mode,fn){return new Promise((res,rej)=>{const t=idb.transaction(store,mode);const s=t.objectStore(store);let out;const q=fn(s);if(q)q.onsuccess=()=>{out=q.result;};t.oncomplete=()=>res(out);t.onerror=()=>rej(t.error);});}
const kvGet=k=>tx("kv","readonly",s=>s.get(k));
const kvSet=(k,v)=>tx("kv","readwrite",s=>s.put(v,k));

let state={collections:{}};
const ready=(async()=>{try{idb=await openIdb();const s=await kvGet("state");if(s&&s.collections)state=s;}catch(e){console.warn("Storage unavailable",e);}})();
let saveT=null;
function persist(){clearTimeout(saveT);saveT=setTimeout(()=>{if(idb)kvSet("state",state).catch(e=>console.warn(e));},120);}
const docL={}, colL={};
function col(c){return state.collections[c]||(state.collections[c]={});}
function clone(o){return o==null?o:JSON.parse(JSON.stringify(o));}
function snapDoc(c,id){const d=(state.collections[c]||{})[id];return{id,exists:!!d,data:()=>d?clone(d):undefined,metadata:{fromCache:false,hasPendingWrites:false}};}
function snapCol(c){const docs=Object.keys(state.collections[c]||{}).sort().map(id=>snapDoc(c,id));return{docs,size:docs.length,empty:!docs.length,docChanges:()=>[],metadata:{fromCache:false,hasPendingWrites:false}};}
function emit(c,id){(colL[c]||[]).forEach(f=>{try{f(snapCol(c));}catch(e){console.error(e);}});(docL[c+"/"+id]||[]).forEach(f=>{try{f(snapDoc(c,id));}catch(e){console.error(e);}});}
function emitAll(){Object.keys(colL).forEach(c=>(colL[c]||[]).forEach(f=>f(snapCol(c))));Object.keys(docL).forEach(p=>{const i=p.indexOf("/");(docL[p]||[]).forEach(f=>f(snapDoc(p.slice(0,i),p.slice(i+1))));});}
function newId(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8);}
function docRef(c,id){return{
  id,path:c+"/"+id,
  async get(){await ready;return snapDoc(c,id);},
  async set(data){await ready;col(c)[id]=clone(data);persist();emit(c,id);},
  async update(data){await ready;const cur=col(c)[id];if(!cur)throw{code:"invalid_argument",message:"Document does not exist"};Object.assign(cur,clone(data));persist();emit(c,id);},
  async delete(){await ready;delete col(c)[id];persist();emit(c,id);},
  onSnapshot(next){const k=c+"/"+id;(docL[k]=docL[k]||[]).push(next);ready.then(()=>next(snapDoc(c,id)));return()=>{docL[k]=(docL[k]||[]).filter(f=>f!==next);};}
};}
const db={
  doc(p){const i=p.indexOf("/");return docRef(p.slice(0,i),p.slice(i+1));},
  collection(c){return{path:c,doc(id){return docRef(c,id||newId());},async add(data){const r=docRef(c,newId());await r.set(data);return r;},async get(){await ready;return snapCol(c);},onSnapshot(next){(colL[c]=colL[c]||[]).push(next);ready.then(()=>next(snapCol(c)));return()=>{colL[c]=(colL[c]||[]).filter(f=>f!==next);};}};}
};
const user={isOwner:async()=>true,canEdit:async()=>true,can:async()=>true,id:async()=>"me",me:async()=>({id:"me",name:"",email:null})};
const urls={};
const assets={
  async upload(blob,opts){await ready;if(!idb)throw{code:"store_unavailable",message:"Storage unavailable"};if(blob.size>20*1024*1024)throw{code:"file_too_large",message:"Over 20 MB"};const id=newId();await tx("blobs","readwrite",s=>s.put(blob,id));urls[id]=URL.createObjectURL(blob);return{id,url:urls[id],sizeBytes:blob.size,contentType:(opts&&opts.type)||blob.type||"application/octet-stream"};},
  async delete(id){await ready;if(idb)await tx("blobs","readwrite",s=>s.delete(id));return{deleted:true};},
  async list(){return{assets:[],usage:{files:0,bytes:0,maxFiles:0,maxBytes:0}};}
};
async function blobUrl(id){if(urls[id])return urls[id];await ready;const b=idb?await tx("blobs","readonly",s=>s.get(id)):null;if(!b)return null;urls[id]=URL.createObjectURL(b);return urls[id];}
/* uploaded files are linked as /_blob/<id> by the dashboard: open them from local storage instead */
document.addEventListener("click",async e=>{const a=e.target.closest&&e.target.closest('a[href^="/_blob/"]');if(!a)return;e.preventDefault();const u=await blobUrl(a.getAttribute("href").slice(7));if(u)window.open(u,"_blank");else alert("This file is not stored on this phone.");},true);

window.claude={use:async n=>{await ready;return n==="db"?db:n==="user"?user:n==="assets"?assets:null;}};

/* backup and import */
window.offlineData={
  exportObject(){return{app:"knowing-to-doing",version:1,exportedAt:new Date().toISOString(),collections:clone(state.collections)};},
  async importObject(obj,mode){await ready;if(!obj||typeof obj!=="object"||!obj.collections||typeof obj.collections!=="object")throw new Error("This file is not a dashboard backup.");
    let n=0;if(mode==="replace")state.collections={};
    for(const c of Object.keys(obj.collections)){if(!/^[a-z]+$/.test(c))continue;const src=obj.collections[c];if(!src||typeof src!=="object")continue;for(const id of Object.keys(src)){if(src[id]&&typeof src[id]==="object"){col(c)[id]=clone(src[id]);n++;}}}
    if(idb)await kvSet("state",state);emitAll();return n;},
  async counts(){await ready;const o={};Object.keys(state.collections).forEach(c=>o[c]=Object.keys(state.collections[c]).length);return o;},
  async lastBackup(){await ready;return idb?kvGet("lastBackup"):null;},
  async markBackup(){if(idb)await kvSet("lastBackup",new Date().toISOString());},
  async persist(){try{if(navigator.storage&&navigator.storage.persist)return await navigator.storage.persist();}catch(_){}return false;}
};
if("serviceWorker" in navigator&&location.protocol!=="file:"){window.addEventListener("load",()=>{navigator.serviceWorker.register("sw.js").catch(e=>console.warn("Offline cache not registered",e));});}
})();
