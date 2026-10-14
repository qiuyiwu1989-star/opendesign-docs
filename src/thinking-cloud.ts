import {validateLibrary,type ThinkingLibrary} from './thinking-workspace';
export type CloudSession={authenticated:boolean;username?:string};
export type CloudWorkspace={revision:string|null;library:ThinkingLibrary|null;updatedAt?:string};
export class CloudError extends Error{constructor(public status:number,message:string){super(message);}}
export function parseCloudWorkspace(raw:unknown):CloudWorkspace{
 const value=raw as CloudWorkspace;
 if(!value||!(value.revision===null||typeof value.revision==='string')||(value.revision===null)!==(value.library===null))throw new Error('云端返回的数据不完整，本地作品已保留。');
 if(value.library)validateLibrary(value.library);
 return value;
}
async function request(path:string,method='GET',body?:unknown):Promise<unknown>{
 let response:Response;try{response=await fetch('/api/thinking-cloud/'+path,{method,credentials:'same-origin',cache:'no-store',...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});}catch{throw new CloudError(0,'无法连接云端，本地作品已保留。请检查网络后重试。');}
 if(!response.ok){const message=response.status===409?'另一台电脑已保存新内容。当前修改仍在本地，请先下载备份，再打开云端版本进行整理。':response.status===401?'账号或密码不正确，或登录已过期。请重新登录。':response.status===429?'登录尝试过多，请 15 分钟后重试。':response.status===413?'作品超过云端大小限制，请先下载备份。':'云端暂时不可用，本地作品已保留。';throw new CloudError(response.status,message);}
 try{return await response.json();}catch{throw new CloudError(0,'云端服务尚未就绪，本地作品已保留。');}
}
export async function cloudSession():Promise<CloudSession>{const value=await request('session') as CloudSession;if(typeof value?.authenticated!=='boolean')throw new CloudError(0,'云端服务尚未就绪。');return value;}
export async function cloudLogin(username:string,password:string):Promise<CloudSession>{return await request('login','POST',{username,password}) as CloudSession;}
export async function cloudLogout(){await request('logout','POST',{});}
export async function cloudRead():Promise<CloudWorkspace>{return parseCloudWorkspace(await request('workspace'));}
export async function cloudWrite(library:ThinkingLibrary,expectedRevision:string|null):Promise<CloudWorkspace>{return parseCloudWorkspace(await request('workspace','PUT',{library,expectedRevision}));}
export function downloadCloudBackup(library:ThinkingLibrary){const url=URL.createObjectURL(new Blob([JSON.stringify(library)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`画布备份-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
