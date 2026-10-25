import { Client } from "pg";
import { readFile } from "node:fs/promises";
import { join, relative, resolve, isAbsolute } from "node:path";
export async function isolatedNativeDatabase<T>(root: string, work: (client: Client) => Promise<T>): Promise<T> {
  const inside=relative(resolve("artifacts"),resolve(root));
  if(!inside||inside.startsWith("..")||isAbsolute(inside)||!/^phase8-fresh-[\w-]+$/.test(inside))throw new Error("Only a disposable acceptance database is allowed");
  const instance=JSON.parse(await readFile(join(root,".filemind/postgresql/instance.json"),"utf8"));
  const password=(await readFile(join(root,".filemind/postgresql/admin.password"),"utf8")).trim();
  const client=new Client({host:"127.0.0.1",port:instance.port,database:"filemind_ai",user:"filemind_admin",password});
  try {await client.connect();return await work(client);}finally{await client.end();}
}
