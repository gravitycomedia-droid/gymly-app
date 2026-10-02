// Firestore rules regression tests via the Firebase Rules API (projects:test).
// Compiles + evaluates rules server-side WITHOUT deploying. Uses the local
// firebase-tools login (run 'firebase login' first). Usage:
//   node scripts/rules-api-test.cjs firestore.rules
// Add cases to the 'cases' array: [name, 'ALLOW'|'DENY', method, path, auth, existingData, newData].
const FT=require('path').join(require('child_process').execSync('npm root -g').toString().trim(),'firebase-tools','lib')+'/';
const {getAccessToken}=require(FT+'auth.js');const {configstore}=require(FT+'configstore.js');
const fs=require('fs');
const file=process.argv[2];
const D='/databases/(default)/documents';
const gymDoc=(id,owner)=>[{function:'exists',args:[{exactValue:`${D}/gyms/${id}`}],result:{value:true}},{function:'get',args:[{exactValue:`${D}/gyms/${id}`}],result:{value:{data:{owner_id:owner}}}}];
const mocks=[...gymDoc('G1','OWNER1'),...gymDoc('G2','OWNER2'),{function:'exists',args:[{anyValue:{}}],result:{value:false}}];
const member={role:'member',gym_id:'G1',name:'Ravi',phone:'+919999900000',auth_uid:'MUID',subscription_expiry:'2026-10-01'};
const unlinked={...member}; delete unlinked.auth_uid;
const GS={gym_id:'G1',attendance_mode:'biometric'};
const BD={gym_id:'G1',status:'active',label:'Main door'};
const BE={gym_id:'G1',memberId:'MEMDOC',bioPin:1000,fingers:[0],desiredOnDevice:true};
const BU={gym_id:'G1',pin:'4321',at:'2026-10-02'};
const tok=(role,gym,extra={})=>({role,gym_id:gym,phone_number:'+919999900000',firebase:{sign_in_provider:'phone'},...extra});
const cases=[
 ['member extends OWN expiry','DENY','update','users/MEMDOC',{uid:'MUID',token:tok('member','G1')},member,{...member,subscription_expiry:'2099-01-01'}],
 ['member edits own name+weight','ALLOW','update','users/MEMDOC',{uid:'MUID',token:tok('member','G1')},member,{...member,name:'Ravi K',weight:72}],
 ['member signs agreement','ALLOW','update','users/MEMDOC',{uid:'MUID',token:tok('member','G1')},member,{...member,agreement_status:'agreed',agreement_signed_at:'x',agreement_url:'u'}],
 ['member edits OTHER member same gym','DENY','update','users/OTHER',{uid:'MUID',token:tok('member','G1')},{...member,auth_uid:'X2',phone:'+91888'},{...member,auth_uid:'X2',phone:'+91888',subscription_expiry:'2099'}],
 ['member un-deletes self','DENY','update','users/MEMDOC',{uid:'MUID',token:tok('member','G1')},{...member,is_deleted:true},{...member,is_deleted:false}],
 ['first-login phone linking','ALLOW','update','users/MEMDOC',{uid:'MUID',token:tok(null,null)},unlinked,{...unlinked,auth_uid:'MUID',linked_at:'t'}],
 ['linking + sneak expiry','DENY','update','users/MEMDOC',{uid:'MUID',token:tok(null,null)},unlinked,{...unlinked,auth_uid:'MUID',linked_at:'t',subscription_expiry:'2099'}],
 ['receptionist renews member','ALLOW','update','users/MEMDOC',{uid:'R',token:tok('receptionist','G1')},member,{...member,subscription_expiry:'2027'}],
 ['manager renews member','ALLOW','update','users/MEMDOC',{uid:'MG',token:tok('manager','G1')},member,{...member,subscription_expiry:'2027',payment_status:'paid'}],
 ['owner edits member','ALLOW','update','users/MEMDOC',{uid:'OWNER1',token:tok('owner','G1')},member,{...member,subscription_expiry:'2027'}],
 ['owner from OTHER gym edits member','DENY','update','users/MEMDOC',{uid:'OWNER2',token:tok('owner','G2')},member,{...member,subscription_expiry:'2027'}],
 ['trainer assigns workout','ALLOW','update','users/MEMDOC',{uid:'T',token:tok('trainer','G1')},member,{...member,workout_plan_id:'wp1'}],
 ['trainer extends expiry','DENY','update','users/MEMDOC',{uid:'T',token:tok('trainer','G1')},member,{...member,subscription_expiry:'2099'}],
 ['owner self last_active','ALLOW','update','users/OWNER1',{uid:'OWNER1',token:tok('owner','G1')},{role:'owner',gym_id:'G1'},{role:'owner',gym_id:'G1',last_active:'x'}],
 ['owner changes own gym_id','DENY','update','users/OWNER1',{uid:'OWNER1',token:tok('owner','G1')},{role:'owner',gym_id:'G1'},{role:'owner',gym_id:'G2'}],
 ['ATTACK: self-create owner of other gym','DENY','create','users/EVIL',{uid:'EVIL',token:{phone_number:'+91777',firebase:{sign_in_provider:'phone'}}},null,{role:'owner',gym_id:'G1'}],
 ['ATTACK: anon kiosk self-create owner','DENY','create','users/ANON',{uid:'ANON',token:{firebase:{sign_in_provider:'anonymous'}}},null,{role:'owner',gym_id:'G1'}],
 ['owner signup (own gym, no claims yet)','ALLOW','create','users/OWNER1',{uid:'OWNER1',token:{phone_number:'+91666',firebase:{sign_in_provider:'phone'}}},null,{role:'owner',gym_id:'G1',name:'O'}],
 ['owner adds member (claims)','ALLOW','create','users/NEWM',{uid:'OWNER1',token:tok('owner','G1')},null,{role:'member',gym_id:'G1',name:'N'}],
 ['receptionist adds member','ALLOW','create','users/NEWM',{uid:'R',token:tok('receptionist','G1')},null,{role:'member',gym_id:'G1'}],
 ['manager adds member','ALLOW','create','users/NEWM',{uid:'MG',token:tok('manager','G1')},null,{role:'member',gym_id:'G1'}],
 ['receptionist adds member to OTHER gym','DENY','create','users/NEWM',{uid:'R',token:tok('receptionist','G1')},null,{role:'member',gym_id:'G2'}],
 ['onboarding: owner adds staff before claims','ALLOW','create','users/NEWS',{uid:'OWNER1',token:{phone_number:'+91666',firebase:{sign_in_provider:'phone'}}},null,{role:'receptionist',gym_id:'G1'}],
 ['owner adds manager','ALLOW','create','users/NEWS',{uid:'OWNER1',token:tok('owner','G1')},null,{role:'manager',gym_id:'G1'}],
 ['receptionist creates manager','DENY','create','users/NEWS',{uid:'R',token:tok('receptionist','G1')},null,{role:'manager',gym_id:'G1'}],
 ['member creates member doc','DENY','create','users/NEWM',{uid:'MUID',token:tok('member','G1')},null,{role:'member',gym_id:'G1'}],
 ['owner creates 2nd owner doc','DENY','create','users/X',{uid:'OWNER1',token:tok('owner','G1')},null,{role:'owner',gym_id:'G1'}],
 ['member reads own doc (read path unchanged)','ALLOW','get','users/MEMDOC',{uid:'MUID',token:tok('member','G1')},member,null],
 // gym_settings (D1) — owner/manager read own gym; no client writes
 ['owner reads own gym_settings','ALLOW','get','gym_settings/G1',{uid:'OWNER1',token:tok('owner','G1')},GS,null],
 ['manager reads own gym_settings','ALLOW','get','gym_settings/G1',{uid:'MG',token:tok('manager','G1')},GS,null],
 ['receptionist reads gym_settings','DENY','get','gym_settings/G1',{uid:'R',token:tok('receptionist','G1')},GS,null],
 ['member reads gym_settings','DENY','get','gym_settings/G1',{uid:'MUID',token:tok('member','G1')},GS,null],
 ['owner of OTHER gym reads gym_settings','DENY','get','gym_settings/G1',{uid:'OWNER2',token:tok('owner','G2')},GS,null],
 ['unauthenticated reads gym_settings','DENY','get','gym_settings/G1',null,GS,null],
 ['owner creates gym_settings (bypass plan)','DENY','create','gym_settings/G1',{uid:'OWNER1',token:tok('owner','G1')},null,GS],
 ['owner flips mode directly','DENY','update','gym_settings/G1',{uid:'OWNER1',token:tok('owner','G1')},GS,{...GS,attendance_mode:'qr'}],
 ['owner deletes gym_settings','DENY','delete','gym_settings/G1',{uid:'OWNER1',token:tok('owner','G1')},GS,null],
 // bio_* (Part 1) — read-only for the right roles; no client writes
 ['bio_devices get as o','ALLOW','get','bio_devices/SN123456',{uid:'OWNER1',token:tok('owner','G1')},BD,null],
 ['bio_devices get as mg','ALLOW','get','bio_devices/SN123456',{uid:'MG',token:tok('manager','G1')},BD,null],
 ['bio_devices get as r','DENY','get','bio_devices/SN123456',{uid:'R',token:tok('receptionist','G1')},BD,null],
 ['bio_devices get as t','DENY','get','bio_devices/SN123456',{uid:'T',token:tok('trainer','G1')},BD,null],
 ['bio_devices get as m','DENY','get','bio_devices/SN123456',{uid:'MUID',token:tok('member','G1')},BD,null],
 ['bio_devices get as o2','DENY','get','bio_devices/SN123456',{uid:'OWNER2',token:tok('owner','G2')},BD,null],
 ['bio_devices get as anon','DENY','get','bio_devices/SN123456',{uid:'ANON',token:{firebase:{sign_in_provider:'anonymous'}}},BD,null],
 ['bio_devices get as none','DENY','get','bio_devices/SN123456',null,BD,null],
 ['owner creates bio_device (bypass claim)','DENY','create','bio_devices/SN999999',{uid:'OWNER1',token:tok('owner','G1')},null,BD],
 ['owner edits own bio_device','DENY','update','bio_devices/SN123456',{uid:'OWNER1',token:tok('owner','G1')},BD,{...BD,status:'active'}],
 ['owner deletes bio_device','DENY','delete','bio_devices/SN123456',{uid:'OWNER1',token:tok('owner','G1')},BD,null],
 ['bio_enrollments get as o','ALLOW','get','bio_enrollments/G1_1000',{uid:'OWNER1',token:tok('owner','G1')},BE,null],
 ['bio_enrollments get as mg','ALLOW','get','bio_enrollments/G1_1000',{uid:'MG',token:tok('manager','G1')},BE,null],
 ['bio_enrollments get as r','ALLOW','get','bio_enrollments/G1_1000',{uid:'R',token:tok('receptionist','G1')},BE,null],
 ['bio_enrollments get as t','DENY','get','bio_enrollments/G1_1000',{uid:'T',token:tok('trainer','G1')},BE,null],
 ['bio_enrollments get as m','DENY','get','bio_enrollments/G1_1000',{uid:'MUID',token:tok('member','G1')},BE,null],
 ['bio_enrollments get as o2','DENY','get','bio_enrollments/G1_1000',{uid:'OWNER2',token:tok('owner','G2')},BE,null],
 ['bio_enrollments get as anon','DENY','get','bio_enrollments/G1_1000',{uid:'ANON',token:{firebase:{sign_in_provider:'anonymous'}}},BE,null],
 ['bio_enrollments get as none','DENY','get','bio_enrollments/G1_1000',null,BE,null],
 ['receptionist sets desiredOnDevice','DENY','update','bio_enrollments/G1_1000',{uid:'R',token:tok('receptionist','G1')},BE,{...BE,desiredOnDevice:true}],
 ['owner creates enrollment','DENY','create','bio_enrollments/G1_1001',{uid:'OWNER1',token:tok('owner','G1')},null,BE],
 ['bio_unmatched_punches get as o','ALLOW','get','bio_unmatched_punches/P1',{uid:'OWNER1',token:tok('owner','G1')},BU,null],
 ['bio_unmatched_punches get as mg','ALLOW','get','bio_unmatched_punches/P1',{uid:'MG',token:tok('manager','G1')},BU,null],
 ['bio_unmatched_punches get as r','DENY','get','bio_unmatched_punches/P1',{uid:'R',token:tok('receptionist','G1')},BU,null],
 ['bio_unmatched_punches get as m','DENY','get','bio_unmatched_punches/P1',{uid:'MUID',token:tok('member','G1')},BU,null],
 ['bio_unmatched_punches get as o2','DENY','get','bio_unmatched_punches/P1',{uid:'OWNER2',token:tok('owner','G2')},BU,null],
 ['bio_unmatched_punches get as none','DENY','get','bio_unmatched_punches/P1',null,BU,null],
 ['owner writes unmatched punch','DENY','create','bio_unmatched_punches/P2',{uid:'OWNER1',token:tok('owner','G1')},null,BU],
 ['bio_commands owner get','DENY','get','bio_commands/C1',{uid:'OWNER1',token:tok('owner','G1')},{gym_id:'G1'},null],
 ['bio_commands owner create','DENY','create','bio_commands/C1',{uid:'OWNER1',token:tok('owner','G1')},null,{gym_id:'G1'}],
 ['bio_commands anon kiosk get','DENY','get','bio_commands/C1',{uid:'ANON',token:{firebase:{sign_in_provider:'anonymous'}}},{gym_id:'G1'},null],
 ['bio_templates owner get','DENY','get','bio_templates/G1_1000_1_0',{uid:'OWNER1',token:tok('owner','G1')},{gym_id:'G1'},null],
 ['bio_templates owner create','DENY','create','bio_templates/G1_1000_1_0',{uid:'OWNER1',token:tok('owner','G1')},null,{gym_id:'G1'}],
 ['bio_templates anon kiosk get','DENY','get','bio_templates/G1_1000_1_0',{uid:'ANON',token:{firebase:{sign_in_provider:'anonymous'}}},{gym_id:'G1'},null],
 ['bio_raw_logs owner get','DENY','get','bio_raw_logs/L1',{uid:'OWNER1',token:tok('owner','G1')},{gym_id:'G1'},null],
 ['bio_raw_logs owner create','DENY','create','bio_raw_logs/L1',{uid:'OWNER1',token:tok('owner','G1')},null,{gym_id:'G1'}],
 ['bio_raw_logs anon kiosk get','DENY','get','bio_raw_logs/L1',{uid:'ANON',token:{firebase:{sign_in_provider:'anonymous'}}},{gym_id:'G1'},null],
 ['bio_counters owner get','DENY','get','bio_counters/G1',{uid:'OWNER1',token:tok('owner','G1')},{gym_id:'G1'},null],
 ['bio_counters owner create','DENY','create','bio_counters/G1',{uid:'OWNER1',token:tok('owner','G1')},null,{gym_id:'G1'}],
 ['bio_counters anon kiosk get','DENY','get','bio_counters/G1',{uid:'ANON',token:{firebase:{sign_in_provider:'anonymous'}}},{gym_id:'G1'},null],
 ['owner bumps bio_counters','DENY','update','bio_counters/G1',{uid:'OWNER1',token:tok('owner','G1')},{gym_id:'G1',next:1000},{gym_id:'G1',next:1}],
];
const toV=o=>o;
(async()=>{
 const t=(await getAccessToken(configstore.get('tokens').refresh_token,[])).access_token;
 const testCases=cases.map(([n,exp,method,path,auth,res,newData])=>{
   const req={auth,method,path:`${D}/${path}`,time:'2026-10-02T00:00:00Z'};
   if(newData) req.resource={data:newData};
   const tc={expectation:exp,request:req,functionMocks:mocks};
   if(res) tc.resource={data:res};
   return tc;});
 const body={source:{files:[{name:'firestore.rules',content:fs.readFileSync(file,'utf8')}]},testSuite:{testCases}};
 const r=await (await fetch('https://firebaserules.googleapis.com/v1/projects/gymly-app-06:test',{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
 if(r.error){console.log(JSON.stringify(r.error).slice(0,1500));process.exit(1)}
 (r.issues||[]).forEach(i=>console.log('ISSUE',i.severity,i.description,JSON.stringify(i.sourcePosition)));
 let pass=0;
 r.testResults.forEach((x,i)=>{const ok=x.state==='SUCCESS'; if(ok)pass++; console.log(ok?'PASS':'FAIL', cases[i][1].padEnd(5), cases[i][0], ok?'':JSON.stringify(x.debugMessages||x.errorPosition||'').slice(0,300));});
 console.log(`${pass}/${cases.length} passed`);
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
