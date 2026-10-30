import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraft, draftChanged, savePagesVerified } from '../src/user-edit.js';
import { createMemoryStorage, normalizeUserState, createUserBackup, restoreUserBackup } from '../src/data/storage.js';
const key = 'AVA_CI_USER_STATE_V1';
const page = {id:'p1',type:'image',title:'舊標題',subtitle:'',content:'說明',flowPosition:4,sortOrder:0,visible:true,createdAt:'x',updatedAt:'y',overrides:{note:'keep'},media:[{id:'m',provider:'cloud-storage',cloudFileRef:'https://example.com/a',name:'a',mimeType:'image/png',size:1,width:null,height:null,duration:null,pageId:'p1',order:0,status:'ready'}]};
function fixture() { const user=normalizeUserState({pages:[page],pagePreferences:{introTitle:'legacy',showIntro:false},flow:{monthlyNeed:123},overrides:{legacy:'keep'}}); user.unknownLegacy = { x: 2 }; return {user, storage:createMemoryStorage({[key]:JSON.stringify(user)})}; }
test('draft preview is isolated; save readback preserves customer and legacy values', () => { const {user,storage}=fixture(); const saved=createDraft(user); const draft=createDraft(user); draft[0].title='新標題'; assert.equal(JSON.parse(storage.getItem(key)).pages[0].title,'舊標題'); assert.ok(draftChanged(draft,saved)); const result=savePagesVerified({storage,user,savedPages:saved,draft,normalize:normalizeUserState}); assert.equal(result.pages[0].title,'新標題'); assert.equal(result.pagePreferences.introTitle,'legacy'); assert.equal(result.flow.monthlyNeed,123); assert.deepEqual(result.unknownLegacy,{x:2}); assert.deepEqual(result.pages[0].media,saved[0].media); assert.deepEqual(restoreUserBackup(createUserBackup(result)).pages,result.pages); });
test('write rejects changes outside presentation allowlist and preserves original media', () => { const {user,storage}=fixture(); const saved=createDraft(user), draft=createDraft(user); draft[0].media[0].cloudFileRef='https://evil.example/'; draft[0].overrides.note='changed'; draft[0].type='video'; const result=savePagesVerified({storage,user,savedPages:saved,draft,normalize:normalizeUserState}); assert.equal(result.pages[0].type,'image'); assert.deepEqual(result.pages[0].media,saved[0].media); assert.deepEqual(result.pages[0].overrides,saved[0].overrides); });
test('failed write preserves pending draft and stored state', () => { const {user,storage}=fixture(); const before=storage.getItem(key), saved=createDraft(user), draft=createDraft(user); draft[0].title='待儲存'; const broken={...storage,setItem(){throw Error('quota')}}; assert.throws(()=>savePagesVerified({storage:broken,user,savedPages:saved,draft,normalize:normalizeUserState}),/quota/); assert.equal(storage.getItem(key),before); assert.equal(draft[0].title,'待儲存'); });
test('readback mismatch fails, preserves draft, and does not claim success', () => { const {user,storage}=fixture(); const saved=createDraft(user), draft=createDraft(user); draft[0].title='待儲存'; let count=0; const broken={...storage,getItem(k){count++; return count===2 ? 'mismatch' : storage.getItem(k)}}; assert.throws(()=>savePagesVerified({storage:broken,user,savedPages:saved,draft,normalize:normalizeUserState}),/讀回不一致/); assert.equal(draft[0].title,'待儲存'); assert.equal(JSON.parse(storage.getItem(key)).pages[0].title,'舊標題'); });
test('concurrent edits are rejected and cancelling uses last saved copy', () => { const {user,storage}=fixture(); const saved=createDraft(user),draft=createDraft(user); draft[0].title='new'; const remote=JSON.parse(storage.getItem(key)); remote.pages[0].title='other'; storage.setItem(key,JSON.stringify(remote)); assert.throws(()=>savePagesVerified({storage,user,savedPages:saved,draft,normalize:normalizeUserState}),/另一個視窗/); assert.equal(createDraft({pages:saved})[0].title,'舊標題'); });

test('first save retains current customer state even before prior storage exists', () => { const user=normalizeUserState({flow:{monthlyNeed:456},pages:[]}); const storage=createMemoryStorage(); const draft=[{...page, id:'new',type:'content',media:[],overrides:{}}]; const result=savePagesVerified({storage,user,savedPages:[],draft,normalize:normalizeUserState}); assert.equal(result.flow.monthlyNeed,456); });

test('legacy personal intro fields preview independently and save without deleting other preference keys', async () => {
  const {createIntro} = await import('../src/user-edit.js');
  const {user,storage}=fixture(); user.pagePreferences.unknown='retain'; storage.setItem(key,JSON.stringify(user));
  const snapshot=createIntro(user), draftIntro={...snapshot,introTitle:'新主訊息',introSubtitle:'新標題',introSupport:'新說明',showIntro:true};
  assert.equal(JSON.parse(storage.getItem(key)).pagePreferences.introTitle,'legacy');
  const result=savePagesVerified({storage,user,savedPages:createDraft(user),draft:createDraft(user),savedIntro:snapshot,draftIntro,normalize:normalizeUserState});
  assert.deepEqual(createIntro(result),draftIntro); assert.equal(result.pagePreferences.unknown,'retain');
  assert.equal(restoreUserBackup(createUserBackup(result)).pagePreferences.introTitle,'新主訊息');
});
test('intro conflicts are detected and pending changes survive', async () => {
  const {createIntro}=await import('../src/user-edit.js'); const {user,storage}=fixture(); const snapshot=createIntro(user); const draftIntro={...snapshot,introSupport:'草稿'};
  const other=JSON.parse(storage.getItem(key)); other.pagePreferences.introTitle='另一個視窗'; storage.setItem(key,JSON.stringify(other));
  assert.throws(()=>savePagesVerified({storage,user,savedPages:createDraft(user),draft:createDraft(user),savedIntro:snapshot,draftIntro,normalize:normalizeUserState}),/另一個視窗/);
  assert.equal(draftIntro.introSupport,'草稿'); assert.equal(JSON.parse(storage.getItem(key)).pagePreferences.introTitle,'另一個視窗');
});
test('scenario navigation does not overwrite another tab presentation data', async () => {
  const {saveScenario}=await import('../src/user-edit.js'); const {user,storage}=fixture(); const remote=JSON.parse(storage.getItem(key)); remote.pages[0].title='遠端'; remote.pagePreferences.introTitle='新介紹'; remote.unknownLegacy.x=3; storage.setItem(key,JSON.stringify(remote)); user.flow.monthlyNeed=999;
  saveScenario({storage,user}); const actual=JSON.parse(storage.getItem(key)); assert.equal(actual.pages[0].title,'遠端'); assert.equal(actual.pagePreferences.introTitle,'新介紹'); assert.equal(actual.flow.monthlyNeed,999); assert.equal(actual.unknownLegacy.x,3);
});
test('invalid intro data never reaches storage', async () => {
  const {createIntro}=await import('../src/user-edit.js'); const {user,storage}=fixture(); const before=storage.getItem(key); const draftIntro={...createIntro(user),showIntro:'no'};
  assert.throws(()=>savePagesVerified({storage,user,savedPages:createDraft(user),draft:createDraft(user),draftIntro,normalize:normalizeUserState}),/無效/); assert.equal(storage.getItem(key),before);
});
