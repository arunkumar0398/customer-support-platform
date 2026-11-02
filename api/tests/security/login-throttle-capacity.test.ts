import express from 'express';
import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../src/middleware/errors.js';
import { createLoginThrottle } from '../../src/modules/auth/routes.js';
import type { AuthOptions } from '../../src/modules/auth/session.js';
const options=(now:number,limits:NonNullable<AuthOptions['testLoginThrottleLimits']>={ip:100000,account:100000}):AuthOptions=>({appOrigin:'http://localhost:5173',sessionSecret:'synthetic-only-secret-with-more-than-32-characters',now:()=>new Date(now),testLoginThrottleLimits:limits});
function invoke(middleware:RequestHandler,ip:string,email:string){const headers:Record<string,string>={};let called=false;let error:unknown;try{middleware({ip,body:{email}} as Parameters<RequestHandler>[0],{setHeader:(name:string,value:number|string)=>headers[name]=String(value)} as unknown as Parameters<RequestHandler>[1],()=>{called=true;});}catch(e){error=e;}return {headers,called,error};}
describe('login throttle capacity policy',()=>{
 it('enforces the 4096-entry ceiling through an Express login route without entering the login handler',async()=>{
  let now=Date.UTC(2026,10,1);let loginHandlerCalls=0;
  const throttle=createLoginThrottle({...options(now),now:()=>new Date(now),testLoginThrottleLimits:{ip:5000,account:5000}});
  let routeIp='';
  const app=express();app.use(express.json());app.disable('trust proxy');
  app.post('/api/auth/login',throttle,(request,response)=>{
   if(!request.ip)throw new Error('Express did not provide the test client IP.');
   routeIp=request.ip;
   loginHandlerCalls++;response.status(204).end();
  });app.use(errorHandler);

  const seededRouteKey=await request(app).post('/api/auth/login').send({email:'capacity-0@example.test',password:'dummy-only'});
  expect(seededRouteKey.status).toBe(204);
  for(let index=1;index<4095;index++){
   const result=invoke(throttle,routeIp,`capacity-${index}@example.test`);
   expect(result.called,`seed account key ${index}`).toBe(true);
   expect(result.error,`seed account key ${index}`).toBeUndefined();
  }
  expect(loginHandlerCalls).toBe(1);

  const existing=await request(app).post('/api/auth/login').send({email:'capacity-0@example.test',password:'dummy-only'});
  expect(existing.status).toBe(204);
  expect(loginHandlerCalls).toBe(2);

  const atCapacity=await request(app).post('/api/auth/login').send({email:'capacity-new@example.test',password:'dummy-only'});
  expect(atCapacity.status).toBe(429);
  expect(atCapacity.headers['retry-after']).toBe('900');
  expect(atCapacity.headers['set-cookie']).toBeUndefined();
  expect(loginHandlerCalls).toBe(2);

  now+=15*60*1000+1;
  const recovered=await request(app).post('/api/auth/login').send({email:'capacity-after-expiry@example.test',password:'dummy-only'});
  expect(recovered.status).toBe(204);
  expect(recovered.headers['retry-after']).toBeUndefined();
  expect(loginHandlerCalls).toBe(3);
 });

 it('allows existing keys at capacity and rejects a new key while all 4096 entries are live',()=>{
  const time=Date.UTC(2026,10,1);const throttle=createLoginThrottle(options(time));
  for(let i=0;i<2048;i++){const result=invoke(throttle,'ip-'+i,'user-'+i+'@example.test');expect(result.called).toBe(true);expect(result.error).toBeUndefined();}
  const existing=invoke(throttle,'ip-0','user-0@example.test');expect(existing.called).toBe(true);expect(existing.error).toBeUndefined();
  const fresh=invoke(throttle,'ip-new','new@example.test');expect(fresh.called).toBe(false);expect(fresh.error).toMatchObject({status:429,code:'RATE_LIMITED'});expect(fresh.headers['Retry-After']).toBe('900');
 });
 it('prunes expired records at capacity and recovers for new keys',()=>{
  const time=Date.UTC(2026,10,1);const clock={value:time};const throttle=createLoginThrottle({...options(time),now:()=>new Date(clock.value)});
  for(let i=0;i<2048;i++)invoke(throttle,'ip-'+i,'user-'+i+'@example.test');
  clock.value+=15*60*1000+1;const recovered=invoke(throttle,'ip-after','after@example.test');expect(recovered.called).toBe(true);expect(recovered.error).toBeUndefined();
 });
 it('enforces account and IP limits independently without password derivation',()=>{
  const time=Date.UTC(2026,10,1);const account=createLoginThrottle(options(time,{ip:100,account:2}));
  expect(invoke(account,'ip-a','same@example.test').called).toBe(true);expect(invoke(account,'ip-b','same@example.test').called).toBe(true);
  const accountBlocked=invoke(account,'ip-c','same@example.test');expect(accountBlocked.error).toMatchObject({status:429,code:'RATE_LIMITED'});
  const ip=createLoginThrottle(options(time,{ip:2,account:100}));expect(invoke(ip,'shared-ip','one@example.test').called).toBe(true);expect(invoke(ip,'shared-ip','two@example.test').called).toBe(true);
  const ipBlocked=invoke(ip,'shared-ip','three@example.test');expect(ipBlocked.error).toMatchObject({status:429,code:'RATE_LIMITED'});
 });
 it('starts with empty counters in a fresh limiter instance (process-local behavior)',()=>{
  const time=Date.UTC(2026,10,1);const prior=createLoginThrottle(options(time,{ip:1,account:1}));invoke(prior,'ip-x','x@example.test');
  expect(invoke(prior,'ip-x','x@example.test').error).toMatchObject({status:429});
  const afterRestart=createLoginThrottle(options(time,{ip:1,account:1}));expect(invoke(afterRestart,'ip-x','x@example.test').called).toBe(true);
 });
});
