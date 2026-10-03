import {createHash} from "node:crypto";
import {unzipSync,zipSync} from "fflate";
import {BACKUP_LIMITS,BackupError,safeArchivePath} from "./format";
export const sha256=(bytes:Uint8Array|string)=>createHash("sha256").update(bytes).digest("hex");
// Inspect the ZIP envelope before fflate allocates decompressed buffers. Entry
// names never become filesystem paths; only UUID destinations are published.
export function unpackArchive(input:Uint8Array):Record<string,Uint8Array>{
 try{
  const bytes=Buffer.from(input);if(bytes.length>BACKUP_LIMITS.archiveBytes||bytes.length<22)throw new BackupError("Backup exceeds supported limits.");
  const end=bytes.length-22;if(bytes.readUInt32LE(end)!==0x06054b50||bytes.readUInt16LE(end+20)!==0||bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6))throw new BackupError();
  const count=bytes.readUInt16LE(end+10);if(count!==bytes.readUInt16LE(end+8)||count>BACKUP_LIMITS.entries)throw new BackupError();
  const offset=bytes.readUInt32LE(end+16),size=bytes.readUInt32LE(end+12);if(offset+size!==end)throw new BackupError();
  const names=new Map<string,number>();let cursor=offset,total=0;const ranges:[number,number][]=[];
  for(let i=0;i<count;i++){
   if(cursor+46>end||bytes.readUInt32LE(cursor)!==0x02014b50)throw new BackupError();
   const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),compressed=bytes.readUInt32LE(cursor+20),length=bytes.readUInt32LE(cursor+24),n=bytes.readUInt16LE(cursor+28),extra=bytes.readUInt16LE(cursor+30),comment=bytes.readUInt16LE(cursor+32),attrs=bytes.readUInt32LE(cursor+38),local=bytes.readUInt32LE(cursor+42);
   const next=cursor+46+n+extra+comment;if(next>end||!n)throw new BackupError();
   const raw=bytes.subarray(cursor+46,cursor+46+n);const name=raw.toString("utf8");
   if(!Buffer.from(name).equals(raw)||!safeArchivePath(name)||names.has(name)||(flags&1)||![0,8].includes(method)||((attrs>>>16)&0xf000)===0xa000||(attrs&16)||bytes.readUInt16LE(cursor+34))throw new BackupError("Unsafe backup archive entry.");
   const limit=name.startsWith("files/")?BACKUP_LIMITS.fileBytes:BACKUP_LIMITS.metadataBytes;if(length>limit||(total+=length)>BACKUP_LIMITS.totalBytes)throw new BackupError("Backup exceeds supported limits.");
   if(local+30>offset||bytes.readUInt32LE(local)!==0x04034b50||bytes.readUInt16LE(local+8)!==method||bytes.readUInt16LE(local+6)!==flags)throw new BackupError();
   const localNameLength=bytes.readUInt16LE(local+26),localExtra=bytes.readUInt16LE(local+28);const start=local+30+localNameLength+localExtra,finish=start+compressed;
   if(finish>offset||!bytes.subarray(local+30,local+30+localNameLength).equals(raw))throw new BackupError();
   if(!(flags&8)&&(bytes.readUInt32LE(local+18)!==compressed||bytes.readUInt32LE(local+22)!==length))throw new BackupError();
   ranges.push([local,finish]);names.set(name,length);cursor=next;
  }
  if(cursor!==end)throw new BackupError();ranges.sort((a,b)=>a[0]-b[0]);for(let i=1;i<ranges.length;i++)if(ranges[i][0]<ranges[i-1][1])throw new BackupError();
  const files=unzipSync(bytes,{filter:file=>{if(names.get(file.name)!==file.originalSize)throw new BackupError();return true;}});
  if(Object.keys(files).length!==names.size)throw new BackupError();for(const [name,length]of names)if(files[name]?.length!==length)throw new BackupError();return files;
 }catch(error){if(error instanceof BackupError)throw error;throw new BackupError();}
}
export function packArchive(files:Record<string,Uint8Array>){for(const path of Object.keys(files))if(!safeArchivePath(path))throw new BackupError("Unsafe backup archive entry.");const bytes=zipSync(files,{level:6});if(bytes.length>BACKUP_LIMITS.archiveBytes)throw new BackupError("Backup exceeds supported limits.");return bytes;}
