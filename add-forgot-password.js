// Run from the skillbridge-hub folder:  node add-forgot-password.js
// Adds "Forgot password?", the recovery-code screen and "New recovery code" to public/app.js.
// It checks every spot first. If anything does not match, it changes NOTHING.
import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "public", "app.js");
if (!fs.existsSync(file)) {
  console.log("Could not find public/app.js.\nOpen the terminal in the skillbridge-hub folder (the one with server.js) and run this again.");
  process.exit(1);
}
let src = fs.readFileSync(file, "utf8");
const crlf = src.includes("\r\n");
src = src.replace(/\r\n/g, "\n");
if (src.includes("authCode")) {
  console.log("Already added. Nothing to do.");
  process.exit(0);
}

const NEW_RENDER_AUTH = String.raw`function renderAuth(){
    var b=$("#authBox");
    if(authCode){
      b.innerHTML='<h3 id="authTitle">Save your recovery code</h3><p class="note">If you ever forget your password, this code lets you set a new one. It is shown only once, so write it down or take a screenshot and keep it somewhere safe.</p><div class="why" style="text-align:center;font-size:1.35rem;font-weight:700;letter-spacing:.08em;user-select:all">'+esc(authCode)+'</div><div class="actions" style="margin-top:12px"><button class="btn ghost" id="authCopy" type="button">Copy code</button><button class="btn" id="authClose" type="button">I have saved it</button></div>';
      return;
    }
    if(auth&&authView==="newcode"){
      b.innerHTML='<h3 id="authTitle">Get a new recovery code</h3><p class="note">Enter your password. Your old recovery code will stop working.</p><form id="authForm" class="f" novalidate><label>Password<input id="aPass" type="password" autocomplete="current-password"></label><button class="btn" type="submit">Make new code</button><div class="note bad" id="authMsg" role="alert">'+esc(authMsg)+'</div></form><button class="save" id="authNewCancel" type="button" style="margin-top:8px">Cancel</button>';
      return;
    }
    if(auth){
      b.innerHTML='<h3 id="authTitle">Hello, '+esc(firstName(auth.user.name))+'</h3><p class="sub" style="margin:6px 0 12px">'+esc(auth.user.name)+(auth.user.email?'<br>'+esc(auth.user.email):'')+'</p><p class="note">'+(auth.mode==="server"?'Your progress, notes and certificates are saved to your account.':'Preview profile: saved on this device only.')+'</p><div class="actions"><button class="btn ghost" id="authOut">Sign out</button>'+(auth.mode==="server"?'<button class="save" id="authNew" type="button">New recovery code</button>':'')+'<button class="save" id="authClose">Close</button></div>';
      return;
    }
    if(!authMode){b.innerHTML='<p>One moment...</p>';return}
    var server=authMode==="server",su=authTab==="signup",fg=server&&authTab==="forgot";
    b.innerHTML='<h3 id="authTitle">'+(fg?'Reset your password':(server?(su?'Create your account':'Sign in'):'Create your profile'))+'</h3>'+
      (fg?'<p class="note">Enter your email, the recovery code you saved when you made your account, and a new password.</p>':(server?'<div class="tabs"><button type="button" data-atab="signin" aria-selected="'+(!su)+'">Sign in</button><button type="button" data-atab="signup" aria-selected="'+su+'">Create account</button></div>':'<p class="note">Preview mode: your profile is saved on this device only. On your own server, real accounts keep your progress on every device.</p>'))+
      '<form id="authForm" class="f" novalidate>'+((su||!server)?'<label>Full name<input id="aName" autocomplete="name" maxlength="60" placeholder="e.g. Abdulhafiz Olorunfemi"></label>':'')+
      (server?'<label>Email<input id="aEmail" type="email" autocomplete="email" value="'+esc(authEmail)+'"></label>':'')+
      (fg?'<label>Recovery code<input id="aCode" autocomplete="off" autocapitalize="characters" maxlength="25" placeholder="ABCD-EFGH-JKLM-NPQR"></label>':'')+
      (server?'<label>'+(fg?'New password (at least 8 characters)':'Password'+(su?' (at least 8 characters)':''))+'<input id="aPass" type="password" autocomplete="'+((su||fg)?'new-password':'current-password')+'"></label>':'')+
      '<button class="btn" type="submit">'+(fg?'Reset password':(server?(su?'Create account':'Sign in'):'Continue'))+'</button>'+
      (server&&!su&&!fg?'<button type="button" class="lnk" data-atab="forgot">Forgot password?</button>':'')+
      (fg?'<button type="button" class="lnk" data-atab="signin">Back to sign in</button>':'')+
      '<div class="note bad" id="authMsg" role="alert">'+esc(authMsg)+'</div></form><button class="save" id="authClose" style="margin-top:8px">Close</button>';
  }
  function copyCode(){
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(authCode).then(function(){toast("Code copied")}).catch(function(){toast("Press and hold the code to copy it")})}
    else toast("Press and hold the code to copy it");
  }
  function renderAuthOld(){`;

const NEW_DO_AUTH = String.raw`if(auth&&authView==="newcode"){
      if(!pw)return fail("Enter your password.");
      return apiPost("/api/auth/recovery-code",{password:pw},{Authorization:"Bearer "+auth.token}).then(function(d){authView="";authCode=d.recoveryCode;authMsg="";renderAuth()}).catch(function(err){fail(err.message)});
    }
    if(server&&authTab==="forgot"){
      var rcode=$("#aCode")?String($("#aCode").value||"").trim():"";
      if(!/^\S+@\S+\.\S+$/.test(email))return fail("Enter your email address.");
      if(rcode.replace(/[^A-Za-z0-9]/g,"").length!==16)return fail("Enter your 16-character recovery code.");
      if(pw.length<8)return fail("Use a new password of at least 8 characters.");
      return apiPost("/api/auth/reset",{email:email,code:rcode,password:pw}).then(function(d){signedIn({token:d.token,user:d.user,mode:"server"},d.recoveryCode)}).catch(function(err){fail(err.message)});
    }
    if((su||!server)&&!NAME_OK.test(name))return fail("Enter your full name using letters only.");`;

// [what to find, what to put instead]. Each "find" must exist exactly once.
const edits = [
  [String.raw`function apiPost(url,body){`, String.raw`function apiPost(url,body,extra){`],
  [String.raw`return fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(function(r){`,
   String.raw`return fetch(url,{method:"POST",headers:Object.assign({"Content-Type":"application/json"},extra||{}),body:JSON.stringify(body)}).then(function(r){`],
  [String.raw`authMode=null,authTab="signin",authMsg="";`, String.raw`authMode=null,authTab="signin",authMsg="",authCode="",authView="",authEmail="";`],
  [String.raw`function closeAuth(){$("#authModal").hidden=true;document.body.classList.remove("modal-open")}`,
   String.raw`function closeAuth(){authCode="";authView="";$("#authModal").hidden=true;document.body.classList.remove("modal-open")}`],
  [String.raw`function renderAuth(){`, NEW_RENDER_AUTH],
  [String.raw`if(tb){authTab=tb.dataset.atab;authMsg="";renderAuth();return}`,
   String.raw`if(tb){if($("#aEmail"))authEmail=$("#aEmail").value;authTab=tb.dataset.atab;authMsg="";renderAuth();return}`],
  [String.raw`if(t.id==="authOut")signOut(false);`,
   String.raw`if(t.id==="authOut")signOut(false);
    if(t.id==="authNew"){authView="newcode";authMsg="";renderAuth()}
    if(t.id==="authNewCancel"){authView="";authMsg="";renderAuth()}
    if(t.id==="authCopy")copyCode();`],
  [String.raw`function fail(m){authMsg=m;renderAuth()}`, String.raw`function fail(m){authMsg=m;if(email)authEmail=email;renderAuth()}`],
  [String.raw`signedIn({token:d.token,user:d.user,mode:"server"})`, String.raw`signedIn({token:d.token,user:d.user,mode:"server"},d.recoveryCode)`],
  [String.raw`if((su||!server)&&!NAME_OK.test(name))return fail("Enter your full name using letters only.");`, NEW_DO_AUTH],
  [String.raw`function signedIn(a){`, String.raw`function signedIn(a,rcode){`],
  [String.raw`function done(){closeAuth();reloadAll();toast("Welcome, "+firstName(a.user.name)+"!")}`,
   String.raw`function done(){if(rcode){authCode=rcode;authView="";authMsg="";renderAuth()}else closeAuth();reloadAll();toast("Welcome, "+firstName(a.user.name)+"!")}`],
];

// Check every spot first, and apply in memory. Nothing is written unless all of them work.
const problems = [];
let out = src;
for (const [find, put] of edits) {
  const n = out.split(find).length - 1;
  if (n !== 1) { problems.push(`${n === 0 ? "not found" : "found " + n + " times"}: ${find.slice(0, 70)}`); continue; }
  out = out.split(find).join(put);
}
if (problems.length) {
  console.log("Nothing was changed, because some parts of app.js are different from what I expected:\n - " + problems.join("\n - "));
  console.log("\nSend me this message and I will adjust the script.");
  process.exit(1);
}

fs.copyFileSync(file, path.join(process.cwd(), "app.js.backup")); // safe copy (git ignores *.backup)
fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
console.log("Done! 'Forgot password?' and recovery codes are now in public/app.js.");
console.log("A copy of your old file was saved as app.js.backup in this folder.");
console.log("Next: replace server.js with the new one, then run the git add / commit / push commands.");