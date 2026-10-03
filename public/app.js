(function(){
  "use strict";
  var SAMPLE=[
    {id:"s1",title:"Junior Web Developer",company:"Brightpath Tech",location:"Lagos, Nigeria",type:"FULLTIME",salary:18000,currency:"USD",period:"year",exp:"under_3_years_experience",role:"web developer"},
    {id:"s2",title:"Frontend Engineer",company:"Nimbus Labs",location:"Remote",type:"FULLTIME",salary:55000,currency:"USD",period:"year",exp:"more_than_3_years_experience",role:"web developer"},
    {id:"s3",title:"Data Analyst",company:"Kora Insights",location:"Abuja, Nigeria",type:"FULLTIME",salary:22000,currency:"USD",period:"year",exp:"no_experience",role:"data analyst"},
    {id:"s4",title:"Product Designer",company:"Orchard Studio",location:"Lagos, Nigeria",type:"FULLTIME",salary:40000,currency:"USD",period:"year",exp:"more_than_3_years_experience",role:"designer"},
    {id:"s5",title:"Digital Marketing Executive",company:"Growthline",location:"Port Harcourt, Nigeria",type:"FULLTIME",salary:15000,currency:"USD",period:"year",exp:"no_experience",role:"digital marketing"},
    {id:"s6",title:"Backend Developer",company:"Ledgerly",location:"Abuja, Nigeria",type:"FULLTIME",salary:48000,currency:"USD",period:"year",exp:"under_3_years_experience",role:"web developer"}
  ];
  var STATUSES=["Applied","Interview","Offer","Rejected"];

  var mem={},curUid="guest",auth=null,syncT=null,curPage="home";
  try{auth=JSON.parse(localStorage.getItem("sb_auth")||"null")}catch(e){auth=null}
  if(auth&&auth.user&&auth.user.id)curUid=auth.user.id;else auth=null;
  var SYNCMAP={sb4_road:"road",sb4_pass:"pass",sb4_certs:"certs",sb4_meta:"meta",sb4_notes:"notes",sb4_act:"log",sb2_saved:"saved",sb2_apps:"apps"};
  function nsKey(k){return /^sb[24]_/.test(k)?"u:"+curUid+":"+k:k}
  function rawGet(fk){try{var v=localStorage.getItem(fk);if(v)return JSON.parse(v)}catch(e){}return mem[fk]}
  function load(k,d){var v=rawGet(nsKey(k));return v!==undefined?v:d}
  function saveLocal(k,v){var fk=nsKey(k);mem[fk]=v;try{localStorage.setItem(fk,JSON.stringify(v))}catch(e){}}
  function save(k,v){saveLocal(k,v);if(SYNCMAP[k])scheduleSync()}
  function scheduleSync(){if(!auth||auth.mode!=="server")return;clearTimeout(syncT);syncT=setTimeout(pushState,1500)}
  function collectState(){var o={};Object.keys(SYNCMAP).forEach(function(k){var v=load(k,undefined);if(v!==undefined&&v!==null&&typeof v==="object")o[SYNCMAP[k]]=v});return o}
  function pushState(){
    if(!auth||auth.mode!=="server")return;
    fetch("/api/state",{method:"PUT",headers:{"Content-Type":"application/json",Authorization:"Bearer "+auth.token},body:JSON.stringify({state:collectState()})})
      .then(function(r){if(r.status===401){toast("Your session expired. Please sign in again.");signOut(true)}}).catch(function(){});
  }
  var saved=load("sb2_saved",{}), apps=load("sb2_apps",{}), prog=load("sb_prog",{});
  if(Array.isArray(saved)||!saved)saved={};
  if(Array.isArray(apps)||!apps)apps={};

  var $=function(s){return document.querySelector(s)};
  var $$=function(s){return Array.prototype.slice.call(document.querySelectorAll(s))};
  function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
  function safeUrl(u){return /^https?:\/\//i.test(u||"")?u:""}
  function toast(t){var el=$("#toast");el.textContent=t;el.classList.add("show");setTimeout(function(){el.classList.remove("show")},2200)}

  function go(id){curPage=id;
    $$("section.page").forEach(function(s){s.classList.toggle("on",s.id===id)});
    $$("nav button").forEach(function(b){if(b.dataset.go===id)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")});
    if(id==="dashboard")renderDash();
    window.scrollTo(0,0);
  }
  $$("[data-go]").forEach(function(b){b.addEventListener("click",function(){go(b.dataset.go)})});

  $("#themeBtn").addEventListener("click",function(){
    var r=document.documentElement,dark=r.dataset.theme?r.dataset.theme==="dark":matchMedia("(prefers-color-scheme: dark)").matches;
    r.dataset.theme=dark?"light":"dark";
  });

  /* ---------- jobs ---------- */
  var cur={jobs:[],page:1,more:false,live:false,loading:false};

  function money(j){
    if(!j.salary)return "";
    var c=j.currency?j.currency+" ":"$";
    var a=Math.round(j.salary).toLocaleString(),b=j.salaryMax&&j.salaryMax>j.salary?" - "+Math.round(j.salaryMax).toLocaleString():"";
    return c+a+b+(j.period?" / "+j.period:" / yr");
  }
  function yearly(j){
    if(!j.salary)return 0;
    var m={hour:2080,day:260,week:52,month:12,year:1}[j.period]||1;
    return j.salary*m;
  }
  function notice(msg){var n=$("#notice");if(msg){n.textContent=msg;n.hidden=false}else n.hidden=true}

  function sampleFilter(){
    var q=$("#fQ").value.trim().toLowerCase(),role=$("#fRole").value,loc=$("#fLoc").value.trim().toLowerCase(),exp=$("#fExp").value;
    return SAMPLE.filter(function(j){
      var hay=(j.title+" "+j.company).toLowerCase();
      var locOk=!loc||loc==="nigeria"||j.location.toLowerCase().indexOf(loc.split(",")[0])>-1||j.location==="Remote";
      return (!q||hay.indexOf(q)>-1)&&(!role||j.role===role)&&locOk&&(!exp||j.exp===exp);
    });
  }

  function search(reset){
    if(cur.loading)return;
    if(reset){cur.jobs=[];cur.page=1}
    var p=new URLSearchParams();
    var q=[$("#fRole").value,$("#fQ").value.trim()].filter(Boolean).join(" ")||"jobs";
    p.set("query",q);p.set("page",cur.page);
    if($("#fLoc").value.trim())p.set("location",$("#fLoc").value.trim());
    if($("#fExp").value)p.set("experience",$("#fExp").value);
    cur.loading=true;$("#searchBtn").disabled=true;$("#searchBtn").textContent="Searching...";
    fetch("/api/jobs?"+p.toString())
      .then(function(r){return r.json().then(function(b){if(!r.ok)throw new Error(b.error||("Error "+r.status));return b})})
      .then(function(b){
        cur.live=true;cur.more=!!b.hasMore;cur.jobs=cur.jobs.concat(b.jobs||[]);notice("");
      })
      .catch(function(e){
        if(reset||!cur.jobs.length){
          cur.live=false;cur.more=false;cur.jobs=sampleFilter();
          notice("Showing sample jobs. Live search is not connected here ("+(e&&e.message?e.message:"server unavailable")+"). It works once the server runs with your job API key.");
        }else{toast("Could not load more jobs")}
      })
      .then(function(){cur.loading=false;$("#searchBtn").disabled=false;$("#searchBtn").textContent="Search jobs";render()});
  }

  function render(){
    var sal=+$("#fSal").value||0,only=$("#onlySaved").checked;
    var list=cur.jobs;
    if(only)list=Object.keys(saved).map(function(k){return saved[k]});
    if(sal)list=list.filter(function(j){return yearly(j)>=sal});
    $("#count").textContent=list.length+" job"+(list.length===1?"":"s")+(only?" saved":" shown");
    $("#jobList").innerHTML=list.length?list.map(function(j){
      var s=!!saved[j.id],a=apps[j.id],u=safeUrl(j.url),m=money(j);
      return '<article class="job"><div class="top"><div><h3>'+esc(j.title)+'</h3><div class="meta"><span>'+esc(j.company)+'</span>'+(j.location?'<span>'+esc(j.location)+'</span>':"")+(j.remote?'<span>Remote</span>':"")+(j.type?'<span>'+esc(String(j.type).toLowerCase().replace(/_/g," "))+'</span>':"")+(m?'<span>'+esc(m)+'</span>':"")+'</div></div></div>'+
        '<div class="actions">'+(u?'<a class="btn" href="'+esc(u)+'" target="_blank" rel="noopener noreferrer" style="text-decoration:none">View and apply</a>':"")+
        '<button class="save" data-save="'+esc(j.id)+'" aria-pressed="'+s+'">'+(s?"Saved":"Save job")+'</button>'+
        '<button class="btn ghost" data-apply="'+esc(j.id)+'"'+(a?" disabled":"")+'>'+(a?"Tracking":"Track application")+'</button></div></article>';
    }).join(""):'<div class="empty">'+(only?"No saved jobs yet. Save one from the search results.":"No jobs match. Try a broader keyword, another location, or a lower minimum salary.")+'</div>';
    $("#more").hidden=!(cur.live&&cur.more&&!only);
  }

  function findJob(id){
    for(var i=0;i<cur.jobs.length;i++)if(String(cur.jobs[i].id)===String(id))return cur.jobs[i];
    return saved[id]||null;
  }
  $("#jobList").addEventListener("click",function(e){
    var s=e.target.closest("[data-save]"),a=e.target.closest("[data-apply]");
    if(s){var id=s.dataset.save,j=findJob(id);if(!j)return;if(saved[id]){delete saved[id];toast("Removed from saved jobs")}else{saved[id]=j;toast("Saved job")}save("sb2_saved",saved);render()}
    if(a){var id2=a.dataset.apply,j2=findJob(id2);if(!j2)return;apps[id2]={job:j2,status:"Applied"};save("sb2_apps",apps);render();toast("Added to your dashboard")}
  });
  $("#jobForm").addEventListener("submit",function(e){e.preventDefault();$("#onlySaved").checked=false;search(true)});
  $("#fSal").addEventListener("input",render);
  $("#onlySaved").addEventListener("change",render);
  $("#more").addEventListener("click",function(){cur.page++;search(false)});
  $("#heroGo").addEventListener("click",function(){$("#fQ").value=$("#heroQ").value;go("jobs");search(true)});
  $("#heroQ").addEventListener("keydown",function(e){if(e.key==="Enter")$("#heroGo").click()});

/* ---------- learn hub ---------- */
  var CAT=JSON.parse($("#catalog-data").textContent);
  var PREVIEW=typeof window.__BANK__!=="undefined",BANK=window.__BANK__||{},PASSMARK=70;
  var TITLES=[[0,"Lost Villager"],[60,"Nervous Apprentice"],[200,"Keyboard Knight"],[500,"Bug Slayer"],[1000,"Dragon Tamer"],[2000,"Archmage of Skills"]];
  var HOURS=[3,5,8,12,20];
  var COACH="Ayo",savedEx=null,ex=null,tmr=null;
  var road,pass,certs,meta,notes,act,expl;
  var view={skill:"",sec:"road",track:"",cat:"All",q:"",hours:0,start:0,startAuto:true,open:{}};
  function fix(o,d){return (o&&typeof o==="object"&&Array.isArray(o)===Array.isArray(d))?o:d}
  function loadLearnState(){
    road=fix(load("sb4_road",{}),{});pass=fix(load("sb4_pass",{}),{});certs=fix(load("sb4_certs",[]),[]);
    meta=fix(load("sb4_meta",{}),{});notes=fix(load("sb4_notes",[]),[]);act=fix(load("sb4_act",[]),[]);expl=fix(load("sb4_explain",{}),{});
    meta.days=Array.isArray(meta.days)?meta.days:[];meta.hours=meta.hours||5;meta.size=meta.size||50;
    savedEx=load("sb4_exam",null);
  }
  loadLearnState();
  function sk(id){for(var i=0;i<CAT.length;i++)if(CAT[i].id===id)return CAT[i];return null}
  function trackOf(s,id){for(var i=0;i<s.tracks.length;i++)if(s.tracks[i].id===id)return s.tracks[i];return null}
  function topicInfo(id){for(var i=0;i<CAT.length;i++){var s=CAT[i];for(var j=0;j<s.tracks.length;j++){var t=s.tracks[j];for(var k=0;k<t.topics.length;k++)if(t.topics[k].id===id)return {s:s,t:t,tp:t.topics[k]}}}return null}
  function passed(id){return !!(pass[id]&&pass[id].pct>=PASSMARK)}
  function trackPassed(t){return t.topics.every(function(tp){return passed(tp.id)})}
  function passedCount(t){return t.topics.filter(function(tp){return passed(tp.id)}).length}
  function stepsTotal(s){var n=0;s.stages.forEach(function(st){n+=st.steps.length});return n}
  function stepsDone(s){return (road[s.id]||[]).length}
  function xp(){var t=0;CAT.forEach(function(s){t+=stepsDone(s)*15});Object.keys(pass).forEach(function(k){if(passed(k))t+=100});return t+certs.length*300+Math.min(notes.length,40)*5}
  function rank(x){var r=0;TITLES.forEach(function(t,i){if(x>=t[0])r=i});return r}
  function shuffle(a){a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t}return a}
  function pad(n){return n<10?"0"+n:""+n}
  function iso(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())}
  function today(){return iso(new Date())}
  function touch(){var t=today();if(meta.days.indexOf(t)<0){meta.days.push(t);meta.days.sort();if(meta.days.length>150)meta.days=meta.days.slice(-150);save("sb4_meta",meta)}}
  function streakInfo(){
    var set={};meta.days.forEach(function(d){set[d]=1});
    var doneToday=!!set[today()],c=new Date(),cur=0;
    if(!doneToday)c.setDate(c.getDate()-1);
    while(set[iso(c)]){cur++;c.setDate(c.getDate()-1)}
    var best=0,run=0,prev=null;
    meta.days.forEach(function(d){var dt=new Date(d+"T00:00:00");if(prev&&Math.round((dt-prev)/864e5)===1)run++;else run=1;if(run>best)best=run;prev=dt});
    return {cur:cur,best:Math.max(best,cur),doneToday:doneToday};
  }
  function logAct(type,skillId,text){act.unshift({t:Date.now(),type:type,skillId:skillId||"",text:text});if(act.length>200)act.length=200;save("sb4_act",act)}
  function ago(ts){var m=Math.round((Date.now()-ts)/60000);if(m<1)return "just now";if(m<60)return m+" min ago";var h=Math.round(m/60);if(h<24)return h+" hour"+(h===1?"":"s")+" ago";var d=Math.round(h/24);return d+" day"+(d===1?"":"s")+" ago"}
  function apiPost(url,body){
    return fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(function(r){
      return r.json().catch(function(){return {}}).then(function(d){
        if(!r.ok){var e=new Error(d.error||("Error "+r.status));e.status=r.status;e.api=!!d.error;throw e}
        return d;
      });
    });
  }
  function renderPlayer(){
    var x=xp(),r=rank(x),nx=TITLES[r+1],base=TITLES[r][0],pv=nx?Math.round((x-base)/(nx[0]-base)*100):100,st=streakInfo();
    var np=Object.keys(pass).filter(passed).length;
    $("#player").innerHTML='<div class="player"><div><div class="meta">Level '+(r+1)+'</div><h3>'+esc(TITLES[r][1])+'</h3></div>'+
      '<div style="flex:1;min-width:190px"><div class="prog" role="progressbar" aria-valuenow="'+pv+'" aria-valuemin="0" aria-valuemax="100"><i style="width:'+pv+'%"></i></div>'+
      '<div class="meta" style="margin-top:6px">'+x+' XP. '+(nx?(nx[0]-x)+' XP until '+esc(nx[1])+'.':'Max level. Go touch grass.')+' Tests passed: '+np+'. Certificates: '+certs.length+'. Streak: '+st.cur+' day'+(st.cur===1?'':'s')+'.</div></div></div>';
  }

  /* ---------- tabs ---------- */
  var TABS=["coach","skills","notes","certs"];
  function showTab(t){
    TABS.forEach(function(k){$("#tab-"+k).hidden=(k!==t);$('[data-tab="'+k+'"]').setAttribute("aria-selected",k===t?"true":"false")});
    if(t==="skills")renderSkillsTab();
    if(t==="notes")renderNotes();
    if(t==="certs")renderCerts();
  }
  $$("[data-tab]").forEach(function(b){b.addEventListener("click",function(){showTab(b.dataset.tab)})});
  function goSkill(id,sec){showTab("skills");openSkill(id,sec||"road")}

  /* ---------- coach (chat) ---------- */
  var chatEl=$("#chat"),optsEl=$("#chatOpts"),hist=[],offlineNoted=false,fs=null;
  var SAGE_RULES="You are Ayo, a friendly and funny skill coach inside the Job and Skills Opportunity Hub. Learners are mostly in Nigeria and Africa, often on phones. Help them choose a skill, teach concepts in simple words, quiz them one question at a time and suggest free resources. Keep replies under 120 words, plain text only, ask at most one question at a time, be encouraging with light humor, and steer unrelated topics back to learning and careers. Never ask for passwords or payment details.";
  function scrollChat(){chatEl.scrollTop=chatEl.scrollHeight}
  function bot(text,html){
    var d=document.createElement("div");d.className="msg bot";
    var av=document.createElement("span");av.className="av";av.setAttribute("aria-hidden","true");av.textContent="🦉";
    var b=document.createElement("div");b.className="bub";
    if(html)b.innerHTML=html;else b.textContent=text;
    d.appendChild(av);d.appendChild(b);chatEl.appendChild(d);scrollChat();return b;
  }
  function me(text){
    var d=document.createElement("div");d.className="msg me";
    var b=document.createElement("div");b.className="bub";b.textContent=text;
    d.appendChild(b);chatEl.appendChild(d);scrollChat();
  }
  function setOpts(list){
    optsEl.innerHTML="";
    list.forEach(function(o){
      var b=document.createElement("button");b.className="chip";b.type="button";b.textContent=o[0];
      b.addEventListener("click",function(){optsEl.innerHTML="";me(o[0]);setTimeout(o[1],300)});
      optsEl.appendChild(b);
    });
  }
  function coachStart(){
    chatEl.innerHTML="";hist=[];
    bot((auth?"Hello "+firstName(auth.user.name)+"! ":"Hi! ")+"I'm Ayo, your skill coach. I ask questions, you answer, and together we find a skill that fits you. Then I show you a roadmap, where to learn, and tests that earn a certificate. Only mild owl jokes.");
    mainOpts();
  }
  function mainOpts(){
    setOpts([["Help me choose a skill",finder],["I know what I want to learn",pickSkill],["I want to take a test",function(){bot("Pick a skill, then open its Test section. You choose a path (for example Frontend or Backend) and take one test per topic.");pickSkill()}]]);
  }
  /* skill finder: each answer adds points to 6 traits: build, data, creative, people, security, business */
  var FQ=[
   {q:"Which task sounds like your kind of fun?",o:[
    {t:"Building something that actually works",w:[3,1,0,0,1,0]},
    {t:"Finding the story hidden in numbers",w:[0,3,0,0,0,1]},
    {t:"Making things look and feel great",w:[0,0,3,1,0,0]},
    {t:"Convincing people to care",w:[0,0,1,3,0,2]},
    {t:"Outsmarting hackers and solving puzzles",w:[1,2,0,0,3,0]},
    {t:"Telling stories with video or sound",w:[0,0,3,1,0,0]}]},
   {q:"How do you feel about maths?",o:[
    {t:"I love it",w:[1,3,0,0,1,1]},{t:"It's fine",w:[1,1,1,1,1,1]},{t:"I'd rather avoid it",w:[0,0,2,2,0,1]}]},
   {q:"How do you like to work?",o:[
    {t:"Alone, with deep focus",w:[2,2,1,0,2,0]},{t:"With people, talking a lot",w:[0,0,1,3,0,2]},{t:"A bit of both",w:[1,1,2,1,1,1]}]},
   {q:"Which would you do for an hour without being paid?",o:[
    {t:"Fix a broken app or gadget",w:[2,1,0,0,2,0]},
    {t:"Redesign a poster or app screen",w:[0,0,3,0,0,0]},
    {t:"Build a spreadsheet about something random",w:[0,3,0,0,0,1]},
    {t:"Write a funny post that gets shared",w:[0,0,2,3,0,1]},
    {t:"Plan a small business idea",w:[0,1,0,1,0,3]}]},
   {q:"What do you want most from a new skill?",o:[
    {t:"Freelance or remote work, fast",w:[2,1,2,2,0,2]},
    {t:"A stable, well-paid career",w:[2,2,0,1,2,1]},
    {t:"Creative freedom",w:[0,0,3,1,0,1]},
    {t:"To start my own business",w:[0,0,1,1,0,3]},
    {t:"I'm just exploring",w:[1,1,1,1,1,1]}]},
   {q:"Which tool would you enjoy opening every day?",o:[
    {t:"A code editor",w:[3,1,0,0,1,0]},
    {t:"A design app or video editor",w:[0,0,3,0,0,0]},
    {t:"A spreadsheet or dashboard",w:[0,3,0,0,0,1]},
    {t:"Social media and documents",w:[0,0,1,3,0,2]}]},
   {q:"How many hours a week can you give?",o:[{t:"Up to 5 hours",h:5},{t:"6 to 10 hours",h:8},{t:"More than 10 hours",h:12}]}
  ];
  function finder(){fs={i:0,s:[0,0,0,0,0,0],h:meta.hours};bot("Great, seven quick questions. There are no wrong answers, only slightly funnier ones.");askF()}
  function askF(){
    var q=FQ[fs.i];
    bot("Question "+(fs.i+1)+" of "+FQ.length+". "+q.q);
    setOpts(q.o.map(function(o){return [o.t,function(){
      if(o.w)fs.s=fs.s.map(function(v,k){return v+o.w[k]});
      if(o.h)fs.h=o.h;
      fs.i++;
      if(fs.i<FQ.length)askF();else finderResult();
    }]}));
  }
  function finderResult(){
    var r=CAT.map(function(s){var sc=0;for(var k=0;k<6;k++)sc+=fs.s[k]*s.prof[k];return {s:s,sc:sc}}).sort(function(a,b){return b.sc-a.sc}).slice(0,3);
    var labels=["Best match","Great match","Good match"];
    meta.hours=fs.h;view.hours=fs.h;save("sb4_meta",meta);
    bot("",'Here are your top matches:<div class="rec">'+r.map(function(x,i){return '<div><strong>'+esc(x.s.icon+" "+x.s.name)+'</strong> ('+labels[i]+')<br><span class="meta">'+esc(x.s.fit)+'</span></div>'}).join("")+'</div>');
    bot("My pick for you is "+r[0].s.name+". With "+fs.h+" hours a week I can plan your timeline. Want to see the roadmap, or jump into a test?");
    setOpts([
      ["Show my roadmap",function(){goSkill(r[0].s.id,"road")}],
      ["Where to learn it",function(){goSkill(r[0].s.id,"learn")}],
      ["Take a test",function(){goSkill(r[0].s.id,"test")}],
      ["Tell me about "+r[1].s.name,function(){skillMenu(r[1].s.id)}],
      ["Start over",finder]
    ]);
  }
  function pickSkill(){
    bot("Pick an area first.");
    setOpts([["Tech",function(){pickIn("Tech")}],["Design & creative",function(){pickIn("Design & creative")}],["Business & writing",function(){pickIn("Business & writing")}],["Back",mainOpts]]);
  }
  function pickIn(cat){
    bot("Which one?");
    setOpts(CAT.filter(function(s){return s.cat===cat}).map(function(s){return [s.icon+" "+s.name,function(){skillMenu(s.id)}]}).concat([["Back",pickSkill]]));
  }
  function skillMenu(id){
    var s=sk(id);
    bot(s.name+": "+s.about+"\nTypical jobs: "+s.jobs.join(", ")+".\nPaths you can be tested on: "+s.tracks.map(function(t){return t.name}).join(", ")+".");
    setOpts([["Show the roadmap",function(){goSkill(id,"road")}],["Where to learn",function(){goSkill(id,"learn")}],["Take a test",function(){goSkill(id,"test")}],["Pick another skill",pickSkill]]);
  }
  function offlineReply(t){
    var x=t.toLowerCase(),hit=null;
    CAT.forEach(function(s){s.kw.forEach(function(w){if(!hit&&new RegExp("(^|[^a-z])"+w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"([^a-z]|$)").test(x))hit=s})});
    if(hit)return hit.name+": "+hit.about+" A good first step: "+hit.stages[0].steps[0]+". Open Skills and tests to see the full roadmap, free resources and the certificate tests.";
    if(/free|cheap|afford|broke/.test(x))return "Many of the best resources are free, like freeCodeCamp, Kaggle Learn and HubSpot Academy. Each skill has a Where to learn list.";
    if(/certificate|cert|exam|test/.test(x))return "Open Skills and tests, pick a skill, then Test. Choose your path and pass each topic test with 70% or more to earn a certificate.";
    if(/job|salary|work|hire/.test(x))return "Jobs follow skills you can prove. Finish a roadmap stage, build a project, pass a test, then try the Jobs tab.";
    if(/start|begin|roadmap|plan|confus|lost|don't know|dont know/.test(x))return "No problem. Tap Help me choose a skill and I'll ask seven quick questions, then show you a roadmap.";
    return "I can chat freely once an AI is connected. Until then, tap Help me choose a skill, or open Skills and tests to browse every skill.";
  }
  function getSample(){
    try{if(window.claude&&window.claude.use)return window.claude.use("sample").catch(function(){return null})}catch(e){}
    return Promise.resolve(null);
  }
  function sageViaSample(){
    return getSample().then(function(sample){
      if(!sample)throw new Error("no sample");
      var turns=[];
      hist.slice(-10).forEach(function(m){
        if(turns.length&&turns[turns.length-1].role===m.role)turns[turns.length-1].content+="\n"+m.content;else turns.push({role:m.role,content:m.content});
      });
      while(turns.length&&turns[0].role!=="user")turns.shift();
      if(!turns.length)throw new Error("empty");
      turns[0]={role:"user",content:SAGE_RULES+"\n\nLearner message:\n"+turns[0].content};
      return sample(turns,{cache:false}).then(function(r){return r.text});
    });
  }
  function askAI(t){
    hist.push({role:"user",content:t});
    var b=bot("Thinking... (owls are slow but wise)");
    function done(txt){b.textContent=txt;hist.push({role:"assistant",content:txt});scrollChat();mainOpts()}
    apiPost("/api/tutor",{messages:hist.slice(-10)}).then(function(d){done(d.reply||"I went blank. Try asking again.")})
      .catch(function(){
        sageViaSample().then(done).catch(function(){
          var txt=offlineReply(t)+(offlineNoted?"":"\n\n(Free typing gets smarter answers once an AI is connected. For now I answer from built-in notes.)");
          offlineNoted=true;done(txt);
        });
      });
  }
  $("#askForm").addEventListener("submit",function(e){
    e.preventDefault();
    var inp=$("#ask"),t=inp.value.trim();if(!t)return;
    inp.value="";optsEl.innerHTML="";me(t);askAI(t);
  });

  /* ---------- skills library ---------- */
  var CATS=["All","Tech","Design & creative","Business & writing"];
  function renderSkillsTab(){
    if(ex){showExamView(true);return}
    $("#skCats").innerHTML=CATS.map(function(c){return '<button type="button" class="chip'+(c===view.cat?' on':'')+'" data-cat="'+esc(c)+'">'+esc(c)+'</button>'}).join("");
    var q=view.q.toLowerCase();
    var list=CAT.filter(function(s){return (view.cat==="All"||s.cat===view.cat)&&(!q||(s.name+" "+s.kw.join(" ")+" "+s.about).toLowerCase().indexOf(q)>-1)});
    $("#skGrid").innerHTML=list.map(function(s){
      var nt=0;s.tracks.forEach(function(t){nt+=t.topics.length});
      return '<button type="button" class="skcard" data-skill="'+s.id+'"><span class="realm-icon" aria-hidden="true">'+s.icon+'</span><strong>'+esc(s.name)+'</strong><span class="meta">'+esc(s.about)+'</span><span class="meta">'+s.tracks.length+' path'+(s.tracks.length===1?'':'s')+', '+nt+' tests</span></button>';
    }).join("")||'<div class="empty">No skill matches. Try another word.</div>';
    $("#skResume").innerHTML=resumeHTML();
    $("#skList").hidden=!!view.skill;$("#skDetail").hidden=!view.skill;$("#skExam").hidden=true;
    if(view.skill)renderDetail();
  }
  function resumeHTML(){
    if(!savedEx||ex)return "";
    var i=topicInfo(savedEx.topicId);if(!i)return "";
    return '<div class="notice">You have a test in progress: <strong>'+esc(i.s.name+", "+i.tp.name)+'</strong>. <button class="btn" id="exResume">Resume</button> <button class="save" id="exDiscard">Discard</button></div>';
  }
  $("#skSearch").addEventListener("input",function(e){view.q=e.target.value;renderSkillsTab()});
  $("#tab-skills").addEventListener("click",function(e){
    var c=e.target.closest("[data-cat]");if(c){view.cat=c.dataset.cat;renderSkillsTab();return}
    var s=e.target.closest("[data-skill]");if(s){openSkill(s.dataset.skill,"road");return}
    if(e.target.id==="exResume")resumeExam();
    if(e.target.id==="exDiscard"){savedEx=null;save("sb4_exam",null);renderSkillsTab()}
  });
  function openSkill(id,sec){
    view.skill=id;view.sec=sec||"road";view.track="";view.startAuto=true;view.open={};
    $("#skList").hidden=true;$("#skDetail").hidden=false;$("#skExam").hidden=true;
    renderDetail();window.scrollTo(0,0);
  }
  function renderDetail(){
    var s=sk(view.skill);if(!s)return;
    var secs=[["road","Roadmap"],["learn","Where to learn"],["test","Tests and certificate"]];
    $("#skDetail").innerHTML='<button type="button" class="save" id="skBack">Back to all skills</button>'+
      '<div class="skhead"><span class="realm-icon" aria-hidden="true">'+s.icon+'</span><div><h3>'+esc(s.name)+'</h3><div class="meta">Typical jobs: '+esc(s.jobs.join(", "))+'</div></div></div>'+
      '<div class="why" style="margin:0 0 12px"><strong>What is this skill?</strong><br>'+esc(s.intro||s.about)+'</div>'+
      '<div class="tabs" role="tablist" aria-label="Skill sections">'+secs.map(function(x){return '<button role="tab" type="button" data-sec="'+x[0]+'" aria-selected="'+(view.sec===x[0])+'">'+x[1]+'</button>'}).join("")+'</div><div id="skBody"></div>';
    renderSec();
  }
  function renderSec(){
    if(view.sec==="road")renderRoad();else if(view.sec==="learn")renderRes();else renderTest();
  }
  $("#skDetail").addEventListener("click",function(e){
    var t=e.target;
    if(t.id==="skBack"){view.skill="";renderSkillsTab();return}
    var sc=t.closest("[data-sec]");if(sc){view.sec=sc.dataset.sec;renderDetail();return}
    var tr=t.closest("[data-track]");if(tr){view.track=tr.dataset.track;renderTest();return}
    var tk=t.closest("[data-take]");if(tk){takeClicked(tk.dataset.take);return}
    var cl=t.closest("[data-claim]");if(cl){claimCert(cl.dataset.claim);return}
    var ea=t.closest("[data-auth]");if(ea){openAuth();return}
    var xe=t.closest("[data-explain]");if(xe)toggleExplain(xe.dataset.explain);
  });
  $("#skDetail").addEventListener("change",function(e){
    var t=e.target,s=sk(view.skill);
    if(t.id==="rHours"){view.hours=+t.value;meta.hours=view.hours;save("sb4_meta",meta);renderRoad()}
    else if(t.id==="rStart"){view.start=+t.value;renderRoad()}
    else if(t.dataset&&t.dataset.step){
      var a=road[s.id]||[],k=t.dataset.step,i=a.indexOf(k),sp=k.split(":"),stepText=s.stages[+sp[0]].steps[+sp[1]];
      if(t.checked&&i<0){a.push(k);touch();logAct("learn",s.id,stepText);toast("New skill learned: "+stepText)}
      if(!t.checked&&i>-1){a.splice(i,1);act=act.filter(function(x){return !(x.type==="learn"&&x.skillId===s.id&&x.text===stepText)});save("sb4_act",act)}
      road[s.id]=a;save("sb4_road",road);renderRoad();renderPlayer();
    }
    else if(t.id==="exSize"){meta.size=+t.value;save("sb4_meta",meta)}
  });

  /* explain buttons: AI if available, otherwise a built-in explanation */
  function getSample(){
    try{if(window.claude&&window.claude.use)return window.claude.use("sample").catch(function(){return null})}catch(e){}
    return Promise.resolve(null);
  }
  function sampleOnce(prompt){
    return getSample().then(function(sm){
      if(!sm)return null;
      return sm([{role:"user",content:SAGE_RULES+"\n\n"+prompt}],{cache:false}).then(function(r){return r.text}).catch(function(){return null});
    });
  }
  function askExplain(prompt,fallback){
    return apiPost("/api/tutor",{messages:[{role:"user",content:prompt}]}).then(function(d){return d.reply?{text:d.reply,ai:true}:{text:fallback,ai:false}})
      .catch(function(){return sampleOnce(prompt).then(function(t){return t?{text:t,ai:true}:{text:fallback,ai:false}})});
  }
  function toggleExplain(ek){
    if(view.open[ek]){delete view.open[ek];renderSec();return}
    var p=ek.split(":"),s=sk(p[1]),prompt,fallback;
    if(p[0]==="r"){
      var st=s.stages[+p[2]],step=st.steps[+p[3]];
      prompt="Explain this learning step to a complete beginner in simple words. Skill: "+s.name+". Step: "+step+". Give what it means, one tiny real-life example and one small thing to practice today. Under 100 words.";
      fallback=st.why+" Tip: search for a beginner tutorial on this step, study one lesson today, then write a short note in your own words in the My notes tab.";
    }else{
      var r=s.res[+p[2]];
      prompt="A complete beginner wants to learn "+s.name+" using "+r.n+" ("+r.u+"). In 3 short numbered steps explain how to start today and how to use it well. Under 90 words. Do not invent course names or features you are not sure about.";
      fallback="Open "+r.n+", create a free account if it asks, find the beginner course for "+s.name+", and study 30 to 60 minutes a day. After each lesson write one note in your own words in the My notes tab.";
    }
    if(expl[ek]){view.open[ek]=expl[ek];renderSec();return}
    view.open[ek]="Thinking... one moment.";renderSec();
    askExplain(prompt,fallback).then(function(r){
      if(!view.open[ek])return;
      view.open[ek]=r.text;if(r.ai){expl[ek]=r.text;save("sb4_explain",expl)}
      renderSec();
    });
  }

  /* ---------- roadmap ---------- */
  function renderRoad(){
    var s=sk(view.skill),b=$("#skBody");
    if(view.startAuto){view.start=0;view.startAuto=false}
    var hrs=view.hours||meta.hours||5;if(HOURS.indexOf(hrs)<0)hrs=5;view.hours=hrs;
    var wk=0,out="",tot=stepsTotal(s),dn=stepsDone(s);
    s.stages.forEach(function(st,si){
      var skip=si<view.start,w=Math.ceil(st.h/hrs),from=wk+1,to=wk+w;
      if(!skip)wk=to;
      out+='<article class="stage'+(skip?' skip':'')+'"><h3>Stage '+(si+1)+': '+esc(st.n)+'</h3><div class="meta">About '+st.h+' hours. '+(skip?'Skim this one, you already know most of it.':'Weeks '+from+' to '+to+'.')+'</div>'+
        '<p class="stagewhy">'+esc(st.why||"")+'</p><ul class="mods">'+
        st.steps.map(function(step,k){
          var key=si+":"+k,on=(road[s.id]||[]).indexOf(key)>-1,ek="r:"+s.id+":"+key;
          return '<li><label><input type="checkbox" data-step="'+key+'"'+(on?' checked':'')+'> '+esc(step)+'</label> <button type="button" class="lnk" data-explain="'+ek+'">'+(view.open[ek]?'Hide':'Explain this')+'</button>'+(view.open[ek]?'<div class="explain">'+esc(view.open[ek])+'</div>':'')+'</li>';
        }).join("")+
        '</ul><div class="why"><strong>Milestone project:</strong> '+esc(st.p)+'</div></article>';
    });
    var pv=tot?Math.round(dn/tot*100):0;
    b.innerHTML='<p class="sub">No roadmap? Here is one. Choose your weekly hours and level, then tick off steps as you learn them. Tap Explain this on any step if you are not sure what it means. Each step gives 15 XP.</p>'+
      '<div class="ctrl"><label>Hours per week<select id="rHours">'+HOURS.map(function(h){return '<option value="'+h+'"'+(h===hrs?' selected':'')+'>'+h+' hours</option>'}).join("")+'</select></label>'+
      '<label>Your level<select id="rStart">'+["Beginner (start from zero)","Intermediate (I know the basics)","Advanced (I already build things)"].map(function(l,i){return '<option value="'+i+'"'+(i===view.start?' selected':'')+'>'+l+'</option>'}).join("")+'</select></label></div>'+
      '<div class="player"><div><div class="meta">Estimated time</div><h3>About '+wk+' weeks</h3></div><div style="flex:1;min-width:190px"><div class="prog" role="progressbar" aria-valuenow="'+pv+'" aria-valuemin="0" aria-valuemax="100"><i style="width:'+pv+'%"></i></div><div class="meta" style="margin-top:6px">'+dn+' of '+tot+' steps done. Estimate for steady effort at '+hrs+' hours a week.</div></div></div>'+
      out+'<div class="actions"><button class="btn gold" data-sec="test">Take a test</button><button class="btn ghost" data-sec="learn">Where to learn this</button></div>';
  }

  /* ---------- where to learn ---------- */
  function renderRes(){
    var s=sk(view.skill);
    $("#skBody").innerHTML='<p class="sub">Trusted places to learn this skill. Pick one and stay with it for a month. Tap How do I start? for simple steps.</p><div class="res">'+s.res.map(function(r,i){
      var ek="x:"+s.id+":"+i;
      return '<div class="resc"><div><h3>'+esc(r.n)+(i===0?' <span class="badge">Start here</span>':'')+'</h3><div class="meta">'+esc(r.t)+'. '+esc(r.d)+'</div><button type="button" class="lnk" data-explain="'+ek+'">'+(view.open[ek]?'Hide':'How do I start?')+'</button>'+(view.open[ek]?'<div class="explain">'+esc(view.open[ek])+'</div>':'')+'</div><a class="btn ghost" href="'+esc(r.u)+'" target="_blank" rel="noopener noreferrer" style="text-decoration:none">Open site</a></div>';
    }).join("")+'</div><div class="why" style="margin-top:12px"><strong>How to study well</strong><br>1. Study a little every day. 30 to 60 minutes beats 5 hours once a week.<br>2. Finish one course before you start another.<br>3. Build a small project after each stage.<br>4. Write what you learned in the My notes tab, in your own words.<br>5. Protect your streak. Small steps every day make you great.</div>'+
    '<p class="note">Links open other websites. Prices and free plans can change, so check each site.</p>'+
    '<div class="actions"><button class="btn gold" data-sec="road">See the roadmap</button><button class="btn ghost" data-sec="test">Take a test</button></div>';
  }

  /* ---------- tests ---------- */
  function renderTest(){
    var s=sk(view.skill),b=$("#skBody");
    if(s.tracks.length===1)view.track=s.tracks[0].id;
    var t=view.track?trackOf(s,view.track):null;
    if(!t){
      b.innerHTML='<p class="sub">Which path are you on? Pick one, or do both and earn two certificates. Each path has one test per topic. Pass every test with '+PASSMARK+'% or more and you earn a certificate.</p><div class="skgrid">'+
        s.tracks.map(function(tr){return '<button type="button" class="skcard" data-track="'+tr.id+'"><strong>'+esc(tr.name)+'</strong><span class="meta">'+esc(tr.desc)+'</span><span class="meta">Tests: '+esc(tr.topics.map(function(x){return x.name}).join(", "))+'</span><span class="meta">'+passedCount(tr)+' of '+tr.topics.length+' passed</span></button>'}).join("")+'</div>';
      return;
    }
    var all=trackPassed(t),pc=passedCount(t);
    b.innerHTML=(s.tracks.length>1?'<button type="button" class="save" data-track="">Change path</button>':'')+
      '<h3 style="margin-top:12px">'+esc(t.name)+'</h3><p class="sub">'+esc(t.desc)+' Pass all '+t.topics.length+' tests with '+PASSMARK+'% or more to earn your certificate. Every test uses new questions and is timed (one minute per question).</p>'+
      (auth?'<p class="meta">Taking tests as <strong>'+esc(auth.user.name)+'</strong>. This name is printed on your certificate.</p>':'<div class="notice">Sign in so your name is printed on your certificate and your results are saved. <button class="btn" data-auth="1">Sign in</button></div>')+
      '<div class="ctrl"><label>Test length<select id="exSize"><option value="20"'+(meta.size===20?' selected':'')+'>Quick, 20 questions</option><option value="50"'+(meta.size!==20?' selected':'')+'>Full, 50 questions</option></select></label></div>'+
      '<div class="res">'+t.topics.map(function(tp){
        var p=pass[tp.id],ok=passed(tp.id);
        return '<div class="resc"><div><h3>'+esc(tp.name)+(ok?' <span class="badge">Passed '+p.pct+'%</span>':(p?' <span class="badge" style="background:var(--bg);color:var(--ink);border:1px solid var(--line)">Best '+p.pct+'%</span>':''))+'</h3><div class="meta">'+esc(tp.desc)+'</div></div><button class="btn'+(ok?' ghost':'')+'" data-take="'+tp.id+'">'+(ok?'Retake':'Take test')+'</button></div>';
      }).join("")+'</div>'+
      (all?'<div class="player" style="margin-top:14px"><div><h3>All tests passed</h3><div class="meta">You earned a certificate.</div></div><button class="btn gold" data-claim="'+t.id+'">Get my certificate</button></div>':'<p class="note">Progress: '+pc+' of '+t.topics.length+' tests passed.</p>')+
      (PREVIEW?'<p class="note">Preview: this demo grades in your browser. On your own server, questions are generated, graded and certified privately.</p>':'');
  }
  function takeClicked(topicId){
    if(!auth){toast("Sign in first so your name is on your certificate");openAuth();return}
    var sz=$("#exSize");meta.size=sz?(+sz.value||50):meta.size;save("sb4_meta",meta);
    launchExam(topicId,auth.user.name,meta.size);
  }

  /* ---------- exam engine ---------- */
  var ex=null,tmr=null;
  function fmt(sec){sec=Math.max(0,Math.round(sec));var m=Math.floor(sec/60),s=sec%60;return m+":"+(s<10?"0":"")+s}
  function remain(){return Math.round((ex.endsAt-Date.now())/1000)}
  function persist(){if(ex&&!ex.res)save("sb4_exam",ex)}
  function showExamView(on){
    $("#skList").hidden=on||!!view.skill;$("#skDetail").hidden=on||!view.skill;$("#skExam").hidden=!on;
    if(on)$("#skResume").innerHTML="";
  }
  function examNote(title,msg,extra){
    showTabSkills();showExamView(true);
    $("#skExam").innerHTML='<div class="quiz"><h3>'+esc(title)+'</h3><p>'+esc(msg)+'</p>'+(extra||"")+'</div>';
  }
  function showTabSkills(){TABS.forEach(function(k){$("#tab-"+k).hidden=(k!=="skills");$('[data-tab="'+k+'"]').setAttribute("aria-selected",k==="skills"?"true":"false")})}
  function examError(msg){
    ex=null;examNote("Could not start the test",msg,'<div class="actions"><button class="btn" id="exBack">Back</button></div>');
  }
  function launchExam(topicId,name,size){
    var info=topicInfo(topicId);
    examNote("Ayo is preparing your test","Writing "+size+" "+info.tp.name+" questions for you. This can take up to a minute the first time.");
    apiPost("/api/exam/start",{topicId:topicId,name:name,size:size}).then(function(d){
      beginExam({mode:"server",examId:d.examId,skillId:info.s.id,trackId:info.t.id,topicId:topicId,name:name,size:d.questions.length,
        qs:d.questions.map(function(q){return {q:q.q,o:q.o}}),endsAt:Date.now()+d.seconds*1000});
    }).catch(function(e){
      if(e.api)return examError(e.message);
      if(!PREVIEW)return examError("Could not reach the server. Check your internet and try again.");
      makeLocal(info,name,size).then(beginExam).catch(function(err){examError(err.message)});
    });
  }
  function aiPrompt(info,n,have){
    return "Write "+n+" multiple-choice exam questions.\nSkill: "+info.s.name+". Path: "+info.t.name+". Topic: "+info.tp.name+". Topic scope: "+info.tp.desc+".\nDifficulty: this is a hard exam. About 20% intermediate, 50% advanced, 30% tricky (code reading, scenarios, what-happens-if, common mistakes). No trivia.\nRules: exactly one clearly correct answer; 3 plausible wrong answers; never use all of the above or none of the above; each option under 140 characters; independent questions covering different sub-topics; short code snippets inline as plain text if useful.\nVariety seed: "+Math.random().toString(36).slice(2,8)+".\n"+(have.length?"Do not repeat these questions:\n- "+have.map(function(q){return q.q.slice(0,70)}).join("\n- ")+"\n":"")+
      'Return ONLY a JSON array. Each item: {"q":"question","c":"correct option","w":["wrong 1","wrong 2","wrong 3"],"t":"one or two sentence explanation"}';
  }
  function okQ(q){
    if(!q||typeof q.q!=="string"||typeof q.c!=="string"||!Array.isArray(q.w)||q.w.length!==3||typeof q.t!=="string")return false;
    var all=[q.c].concat(q.w);
    if(!all.every(function(x){return typeof x==="string"&&x.length>0&&x.length<=200}))return false;
    return all.map(function(x){return x.trim().toLowerCase()}).filter(function(x,i,a){return a.indexOf(x)===i}).length===4;
  }
  function aiQuestions(info,n,have){
    return getSample().then(function(sample){
      if(!sample)return [];
      var batches=Math.max(1,Math.ceil(n/13)),per=Math.ceil(n/batches),jobs=[];
      for(var i=0;i<batches;i++)jobs.push(sample.json(aiPrompt(info,per,have),{cache:false}).then(function(a){
        if(a&&!Array.isArray(a)&&Array.isArray(a.questions))a=a.questions;
        return Array.isArray(a)?a.filter(okQ):[];
      }).catch(function(){return []}));
      return Promise.all(jobs).then(function(r){
        var seen={},out=[];
        have.forEach(function(q){seen[q.q.trim().toLowerCase()]=1});
        [].concat.apply([],r).forEach(function(q){var k=q.q.trim().toLowerCase();if(!seen[k]){seen[k]=1;out.push(q)}});
        return out.slice(0,n);
      });
    });
  }
  function makeLocal(info,name,size){
    var picked=shuffle(BANK[info.tp.id]||[]).slice(0,size),need=size-picked.length;
    return (need>0?aiQuestions(info,need,picked):Promise.resolve([])).then(function(extra){
      var all=picked.concat(extra);
      if(all.length<5)throw new Error("This preview could not make questions for this topic. Most topics need AI, which needs your permission when asked. Try again and allow it, or use the deployed server.");
      var qs=shuffle(all).map(function(q){
        var opts=shuffle([q.c].concat(q.w));return {q:q.q,o:opts,a:opts.indexOf(q.c),t:q.t};
      });
      return {mode:"local",examId:"",skillId:info.s.id,trackId:info.t.id,topicId:info.tp.id,name:name,size:qs.length,qs:qs,endsAt:Date.now()+qs.length*60*1000};
    });
  }
  function beginExam(o){
    o.ans=o.qs.map(function(){return -1});o.flag=o.qs.map(function(){return false});o.i=0;o.nav=false;o.confirm=false;o.res=null;
    view.skill=o.skillId;view.track=o.trackId;view.sec="test";ex=o;persist();startTimer();showTabSkills();showExamView(true);renderExam();window.scrollTo(0,0);
  }
  function resumeExam(){
    ex=savedEx;savedEx=null;if(!ex)return;
    var i=topicInfo(ex.topicId);view.skill=i?i.s.id:"";
    showTabSkills();showExamView(true);
    if(remain()<=0){renderExam();submitExam(true);return}
    startTimer();renderExam();
  }
  function startTimer(){
    stopTimer();
    tmr=setInterval(function(){
      if(!ex||ex.res){stopTimer();return}
      var r=remain(),el=$("#exTimer");
      if(el){el.textContent=fmt(r);if(r<300)el.className="timer low"}
      if(r<=0){stopTimer();submitExam(true)}
    },1000);
  }
  function stopTimer(){if(tmr){clearInterval(tmr);tmr=null}}
  function renderExam(){
    if(!ex)return;
    if(ex.res){renderResult();return}
    var el=$("#skExam"),n=ex.qs.length,q=ex.qs[ex.i],info=topicInfo(ex.topicId);
    var answered=ex.ans.filter(function(a){return a>=0}).length,L="ABCD";
    var h='<div class="quiz"><div class="exbar"><strong>'+esc(info.s.name+": "+info.tp.name)+'</strong><span class="timer'+(remain()<300?' low':'')+'" id="exTimer">'+fmt(remain())+'</span></div>'+
      '<div class="meta">Question '+(ex.i+1)+' of '+n+'. Answered '+answered+' of '+n+'.</div><div class="prog"><i style="width:'+Math.round(answered/n*100)+'%"></i></div>'+
      '<div class="q" style="white-space:pre-wrap">'+esc(q.q)+'</div><div class="opts">'+
      q.o.map(function(t,k){return '<button type="button" class="opt'+(ex.ans[ex.i]===k?' sel':'')+'" data-pick="'+k+'" aria-pressed="'+(ex.ans[ex.i]===k)+'">'+L[k]+'. '+esc(t)+'</button>'}).join("")+'</div>'+
      '<div class="actions" style="margin-top:12px"><button type="button" class="save" id="exPrev"'+(ex.i===0?' disabled':'')+'>Previous</button><button type="button" class="save" id="exFlag" aria-pressed="'+ex.flag[ex.i]+'">'+(ex.flag[ex.i]?'Flagged':'Flag for review')+'</button><button type="button" class="btn" id="exNext"'+(ex.i===n-1?' disabled':'')+'>Next</button></div>'+
      '<div class="actions" style="margin-top:10px"><button type="button" class="save" id="exNav">'+(ex.nav?'Hide question list':'Show all questions')+'</button><button type="button" class="btn gold" id="exSubmit">Submit test</button></div>';
    if(ex.nav)h+='<div class="qnav">'+ex.qs.map(function(_,k){return '<button type="button" data-go="'+k+'" class="'+(ex.ans[k]>=0?'done ':'')+(ex.flag[k]?'flag ':'')+(k===ex.i?'cur':'')+'" aria-label="Question '+(k+1)+(ex.ans[k]>=0?', answered':', not answered')+(ex.flag[k]?', flagged':'')+'">'+(k+1)+'</button>'}).join("")+'</div>';
    if(ex.confirm){
      var un=n-answered;
      h+='<div class="notice" style="margin-top:12px">'+(un?'You have '+un+' unanswered question'+(un===1?'':'s')+'. ':'')+'Submit now? You cannot change answers after this. <div class="actions" style="margin-top:8px"><button type="button" class="btn" id="exYes">Yes, submit</button><button type="button" class="save" id="exNo">Keep going</button></div></div>';
    }
    el.innerHTML=h+'</div>';
  }
  $("#skExam").addEventListener("click",function(e){
    var t=e.target,id=t.id;
    if(id==="exBack"){ex=null;showExamView(false);renderSkillsTab();return}
    if(!ex)return;
    var p=t.closest("[data-pick]");
    if(p&&!ex.res){ex.ans[ex.i]=+p.dataset.pick;persist();renderExam();return}
    var g=t.closest("[data-go]");if(g&&!ex.res){ex.i=+g.dataset.go;persist();renderExam();return}
    if(ex.res){
      if(id==="rvToggle"){ex.showAll=!ex.showAll;renderResult();return}
      if(id==="rvBack"){var v=view.skill;ex=null;showExamView(false);view.sec="test";renderSkillsTab();return}
      if(id==="rvRetake"){launchExam(ex.topicId,ex.name,ex.size);return}
      if(id==="rvClaim"){claimCert(ex.trackId);return}
      return;
    }
    if(id==="exPrev"&&ex.i>0){ex.i--;persist();renderExam()}
    else if(id==="exNext"&&ex.i<ex.qs.length-1){ex.i++;persist();renderExam()}
    else if(id==="exFlag"){ex.flag[ex.i]=!ex.flag[ex.i];persist();renderExam()}
    else if(id==="exNav"){ex.nav=!ex.nav;renderExam()}
    else if(id==="exSubmit"){ex.confirm=true;renderExam()}
    else if(id==="exNo"){ex.confirm=false;renderExam()}
    else if(id==="exYes")submitExam(false);
  });
  function gradeLocal(){
    var score=0,review=ex.qs.map(function(q,i){
      var yours=ex.ans[i];if(yours===q.a)score++;
      return {q:q.q,o:q.o,yours:yours,correct:q.a,t:q.t};
    });
    var total=ex.qs.length,pct=Math.round(score/total*100);
    return {score:score,total:total,pct:pct,passed:pct>=PASSMARK,pass:PASSMARK,review:review};
  }
  function submitExam(auto){
    if(!ex||ex.submitting||ex.res)return;
    ex.submitting=true;stopTimer();
    $("#skExam").innerHTML='<div class="quiz"><h3>'+(auto?"Time is up. ":"")+'Grading your test...</h3><p>Please wait a moment.</p></div>';
    if(ex.mode==="local"){finishExam(gradeLocal());return}
    apiPost("/api/exam/submit",{examId:ex.examId,answers:ex.ans}).then(finishExam).catch(function(e){
      if(e.status===404||e.status===409){
        var msg=e.message;save("sb4_exam",null);ex=null;
        examNote("This test is no longer available",msg+" Start a new test from the topic list.",'<div class="actions"><button class="btn" id="exBack">Back</button></div>');
      }else{
        ex.submitting=false;toast("Could not submit: "+e.message+". Try again.");startTimer();renderExam();
      }
    });
  }
  function finishExam(r){
    ex.res=r;ex.submitting=false;ex.showAll=false;
    if(r.passed){
      var prev=pass[ex.topicId];
      if(!prev||r.pct>=prev.pct||!passed(ex.topicId))pass[ex.topicId]={pct:r.pct,date:today(),name:ex.name,token:r.token||null};
      save("sb4_pass",pass);
    }else if(!pass[ex.topicId]){
      pass[ex.topicId]={pct:r.pct,date:today(),name:ex.name,token:null};save("sb4_pass",pass);
    }else if(r.pct>pass[ex.topicId].pct&&!passed(ex.topicId)){
      pass[ex.topicId]={pct:r.pct,date:today(),name:ex.name,token:null};save("sb4_pass",pass);
    }
    if(r.passed)logAct("pass",ex.skillId,"Passed the "+topicInfo(ex.topicId).tp.name+" test with "+r.pct+"%");touch();save("sb4_exam",null);renderPlayer();renderExam();window.scrollTo(0,0);
  }
  var WIN=["Passed. The dragon bows and hands you a snack.","Passed! Ayo is doing a victory owl dance.","Passed. Somewhere, a recruiter just sneezed."];
  var LOSE=["Not this time. Read the explanations below, then try again with fresh questions.","So close, or maybe not, but every pro failed a test once. Review and retake.","Not passed yet. The good news: the next test has different questions."];
  function renderResult(){
    var r=ex.res,info=topicInfo(ex.topicId),t=info.t,L="ABCD";
    var wrong=r.review.filter(function(x){return x.yours!==x.correct}),list=ex.showAll?r.review:wrong;
    var h='<div class="quiz"><h3>'+esc(info.s.name+": "+info.tp.name)+'</h3><div class="q">'+r.pct+'%. '+r.score+' of '+r.total+' correct.</div>'+
      '<p><span class="badge" style="'+(r.passed?'':'background:var(--bad);color:#fff')+'">'+(r.passed?'Passed':'Not passed')+'</span> Pass mark is '+PASSMARK+'%.</p><p>'+esc((r.passed?WIN:LOSE)[Math.floor(Math.random()*3)])+'</p>';
    if(r.passed&&trackPassed(t))h+='<div class="notice"><strong>You passed every test in '+esc(t.name)+'.</strong> <button class="btn gold" id="rvClaim">Get my certificate</button></div>';
    else if(r.passed)h+='<p class="meta">Path progress: '+passedCount(t)+' of '+t.topics.length+' tests passed.</p>';
    h+='<div class="actions"><button class="btn" id="rvRetake">'+(r.passed?'Retake':'Retake with new questions')+'</button><button class="save" id="rvBack">Back to topics</button></div>';
    h+='<h3 style="margin-top:18px">Review</h3><div class="meta">'+(ex.showAll?'All questions':(wrong.length?wrong.length+' question'+(wrong.length===1?'':'s')+' to review':'Nothing wrong. Show-off.'))+' <button type="button" class="save" id="rvToggle">'+(ex.showAll?'Show only wrong answers':'Show all questions')+'</button></div>';
    h+=list.map(function(x){
      var ok=x.yours===x.correct;
      return '<div class="why" style="margin-top:10px"><div style="white-space:pre-wrap"><strong>'+esc(x.q)+'</strong></div>'+
        '<div class="meta">Your answer: '+(x.yours>=0?L[x.yours]+'. '+esc(x.o[x.yours]):'Not answered')+(ok?' (correct)':'')+'</div>'+
        (ok?'':'<div class="meta ok">Correct answer: '+L[x.correct]+'. '+esc(x.o[x.correct])+'</div>')+
        '<div style="margin-top:4px">'+esc(x.t||"")+'</div></div>';
    }).join("");
    $("#skExam").innerHTML=h+'</div>';
  }

  /* ---------- certificates (each skill and path gets its own look) ---------- */
  var PAL=[["#0F5C5C","#C99A06"],["#3730A3","#D97706"],["#9F1239","#CA8A04"],["#166534","#A16207"],["#0369A1","#E11D48"],["#6B21A8","#DB2777"],["#334155","#EA580C"],["#047857","#7C3AED"],["#1E3A8A","#B8860B"],["#7F1D1D","#0F766E"],["#1F2937","#65A30D"],["#1D4ED8","#EC4899"]];
  function certTheme(skillId,trackId){
    var si=0,ti=0;
    CAT.forEach(function(s,i){if(s.id===skillId){si=i;s.tracks.forEach(function(t,j){if(t.id===trackId)ti=j})}});
    var p=PAL[(si+ti*5)%PAL.length];return {c1:p[0],c2:p[1],v:(si+ti)%3+1};
  }
  function fmtDate(d){try{return new Date(d+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}catch(e){return d}}
  function certHTML(c){
    var th=certTheme(c.skillId,c.trackId),s=sk(c.skillId),icon=s?s.icon:"★",site="";
    try{site=location.origin&&location.origin!=="null"?location.origin:""}catch(e){}
    var verify=c.demo?'Preview certificate. Not verifiable.':('Verify: '+esc(site+"/?verify="+c.id));
    return '<div class="certwrap"><div class="cert v'+th.v+(c.demo?' cert-demo':'')+'" id="certEl" style="--c1:'+th.c1+';--c2:'+th.c2+'"><div class="band" aria-hidden="true">'+icon+'</div><div class="cert-frame"></div><div class="cert-frame2"></div>'+
      '<div class="cert-in"><div class="cert-brand">JOB &amp; SKILLS OPPORTUNITY HUB</div>'+
      '<div class="cert-title">Certificate of Completion</div>'+
      '<div class="cert-line">This is to certify that</div>'+
      '<div class="cert-name">'+esc(c.name)+'</div>'+
      '<div class="cert-line">has successfully completed the <b>'+esc(c.trackName)+'</b> path in <b>'+esc(c.skillName)+'</b>,<br>passing every required knowledge test:</div>'+
      '<div class="cert-topics">'+c.topics.map(function(t){return esc(t.n)+' '+t.p+'%'}).join('&nbsp;&nbsp;&bull;&nbsp;&nbsp;')+'</div>'+
      '<div class="cert-foot"><div class="sig"><div class="script">Abdulhafiz Olorunfemi</div><div class="sigline"></div><div class="cap">Abdulhafiz Olorunfemi<br>Founder, Job &amp; Skills Opportunity Hub</div></div>'+
      '<div class="seal2" aria-hidden="true">'+icon+'</div>'+
      '<div class="meta-r">Date of issue<br><b>'+esc(fmtDate(c.date))+'</b><br>Average score <b>'+c.avg+'%</b><br>ID <b>'+esc(c.id)+'</b><br><span class="vf">'+verify+'</span></div></div></div></div></div>';
  }
  function showCert(c){$("#certBox").innerHTML=certHTML(c);$("#certModal").hidden=false;document.body.classList.add("modal-open")}
  function closeCert(){$("#certModal").hidden=true;document.body.classList.remove("modal-open")}
  $("#certClose").addEventListener("click",closeCert);
  $("#certPrint").addEventListener("click",function(){
    document.body.classList.add("printing");
    var off=function(){document.body.classList.remove("printing");window.removeEventListener("afterprint",off)};
    window.addEventListener("afterprint",off);
    try{window.print()}catch(e){off();toast("Printing is blocked here. Take a screenshot or open the page in your browser.")}
  });
  function previewCert(name){
    return {id:"PREVIEW",demo:true,name:name||"Your Name",skillId:"web",trackId:"frontend",skillName:"Web development",trackName:"Frontend developer",avg:86,topics:[{n:"HTML",p:92},{n:"CSS",p:85},{n:"JavaScript",p:81}],date:today()};
  }
  function claimCert(trackId){
    var s=sk(view.skill)||(ex&&sk(ex.skillId)),t=s&&trackOf(s,trackId);
    if(!t||!trackPassed(t)){toast("Pass every test in this path first");return}
    var tokens=t.topics.map(function(tp){return pass[tp.id]&&pass[tp.id].token}).filter(Boolean);
    function add(c){
      if(!certs.some(function(x){return x.id===c.id})){certs.push(c);save("sb4_certs",certs);logAct("cert",s.id,"Earned the "+c.trackName+" certificate");touch()}
      renderPlayer();showCert(c);
    }
    if(tokens.length===t.topics.length){
      apiPost("/api/certificate",{tokens:tokens}).then(function(d){add(d.cert)}).catch(function(e){toast(e.message)});
    }else{
      var nm=(auth&&auth.user.name)||(pass[t.topics[0].id]&&pass[t.topics[0].id].name)||"Your Name";
      var tp=t.topics.map(function(x){return {n:x.name,p:pass[x.id].pct}});
      var avg=Math.round(tp.reduce(function(a,x){return a+x.p},0)/tp.length);
      add({id:"PREVIEW-"+Math.random().toString(36).slice(2,8).toUpperCase(),demo:true,name:nm,skillId:s.id,trackId:t.id,skillName:s.name,trackName:t.name,avg:avg,topics:tp,date:today()});
    }
  }
  function renderCerts(){
    var h='<p class="sub">Certificates you earned by passing every test in a path. Each skill and path has its own design, and each has an ID that anyone can check.</p>';
    h+=certs.length?'<div class="res">'+certs.map(function(c,i){return '<div class="resc"><div><h3>'+esc(c.trackName)+(c.demo?' <span class="badge">Preview</span>':'')+'</h3><div class="meta">'+esc(c.skillName+", "+fmtDate(c.date)+", "+c.avg+"% average, ID "+c.id)+'</div></div><button class="btn" data-viewcert="'+i+'">View certificate</button></div>'}).join("")+'</div>':'<div class="empty">No certificates yet. Pass every test in a path to earn one.</div>';
    h+='<div class="actions" style="margin-top:14px"><button class="btn ghost" id="certSample">See a sample certificate</button></div>'+
      '<div class="box" style="margin-top:16px"><h3>Check a certificate</h3><form class="ask" id="vForm"><input id="vId" placeholder="Certificate ID, e.g. SB-1A2B3C4D5E" maxlength="20" aria-label="Certificate ID" autocomplete="off"><button class="btn" type="submit">Check</button></form><div class="note" id="vOut" role="status"></div></div>';
    $("#tab-certs").innerHTML=h;
  }
  $("#tab-certs").addEventListener("click",function(e){
    var v=e.target.closest("[data-viewcert]");if(v){showCert(certs[+v.dataset.viewcert]);return}
    if(e.target.id==="certSample")showCert(previewCert(auth?auth.user.name:""));
  });
  $("#tab-certs").addEventListener("submit",function(e){
    if(e.target.id!=="vForm")return;e.preventDefault();verifyCert($("#vId").value.trim().toUpperCase());
  });
  function verifyCert(id){
    var out=$("#vOut");if(!out)return;
    if(!/^SB-[A-F0-9]{10}$/.test(id)){out.innerHTML='<span class="bad">That does not look like a valid ID. IDs look like SB-1A2B3C4D5E.</span>';return}
    out.textContent="Checking...";
    fetch("/api/certificate/"+encodeURIComponent(id)).then(function(r){return r.json().catch(function(){return {}}).then(function(d){return {ok:r.ok,d:d}})}).then(function(x){
      if(x.ok&&x.d.valid){var c=x.d.cert;out.innerHTML='<span class="ok">Valid certificate.</span> '+esc(c.name)+' completed '+esc(c.trackName)+' ('+esc(c.skillName)+') on '+esc(fmtDate(c.date))+' with an average of '+c.avg+'%.'}
      else out.innerHTML='<span class="bad">No certificate found with that ID.</span>';
    }).catch(function(){out.innerHTML='<span class="bad">Could not reach the server to check this.</span>'});
  }
  function handleVerifyParam(){
    var id="";try{id=(new URLSearchParams(location.search).get("verify")||"").toUpperCase()}catch(e){}
    if(!id)return;
    go("skills");showTab("certs");$("#vId").value=id;verifyCert(id);
  }

  /* ---------- notes ---------- */
  var noteEdit="",noteDel="",noteQ="",noteSkill="";
  function skillSel(sel,general){return '<option value="">'+general+'</option>'+CAT.map(function(s){return '<option value="'+s.id+'"'+(s.id===sel?' selected':'')+'>'+esc(s.name)+'</option>'}).join("")}
  function addNote(skillId,title,text){
    text=String(text||"").trim();
    if(text.length<3){toast("Write a little more first");return false}
    title=String(title||"").trim()||text.slice(0,40);
    var n={id:Date.now().toString(36)+Math.random().toString(36).slice(2,5),skillId:skillId||"",title:title.slice(0,80),text:text.slice(0,4000),t:Date.now(),u:Date.now()};
    notes.unshift(n);if(notes.length>300)notes.length=300;
    save("sb4_notes",notes);touch();logAct("note",n.skillId,"Wrote a note: "+n.title);renderPlayer();toast("Note saved. Great job learning!");return true;
  }
  function renderNotes(){
    var e=noteEdit?notes.filter(function(n){return n.id===noteEdit})[0]:null;
    $("#tab-notes").innerHTML='<p class="sub">Write what you learn in your own words. Explaining something is the best way to remember it. Only you can see your notes.</p>'+
      '<form class="f" id="noteForm" style="max-width:none"><label>Skill<select id="nSkill">'+skillSel(e?e.skillId:noteSkill,"General")+'</select></label>'+
      '<label>Title<input id="nTitle" maxlength="80" value="'+esc(e?e.title:"")+'" placeholder="e.g. How flexbox works"></label>'+
      '<label>What did you learn?<textarea id="nText" rows="6" maxlength="4000" placeholder="Explain it like you are teaching a friend">'+esc(e?e.text:"")+'</textarea></label>'+
      '<div class="actions"><button class="btn" type="submit">'+(e?"Save changes":"Save note")+'</button>'+(e?'<button type="button" class="save" id="nCancel">Cancel</button>':'')+'</div></form>'+
      '<div class="ctrl" style="margin-top:16px"><label>Search notes<input id="nSearch" type="search" value="'+esc(noteQ)+'"></label><label>Skill<select id="nFilter">'+skillSel(noteSkill,"All skills")+'</select></label></div><div id="noteList"></div>';
    renderNoteList();
  }
  function renderNoteList(){
    var q=noteQ.toLowerCase(),l=notes.filter(function(n){return (!noteSkill||n.skillId===noteSkill)&&(!q||(n.title+" "+n.text).toLowerCase().indexOf(q)>-1)}).sort(function(a,b){return b.u-a.u});
    $("#noteList").innerHTML=l.length?l.map(function(n){
      var s=n.skillId?sk(n.skillId):null;
      return '<article class="note-card"><h3>'+esc(n.title)+'</h3><div class="meta">'+(s?esc(s.icon+" "+s.name)+', ':'')+esc(ago(n.u))+'</div><p style="white-space:pre-wrap">'+esc(n.text)+'</p><div class="actions">'+
        (noteDel===n.id?'<span>Delete this note?</span><button class="btn" data-nyes="'+n.id+'">Yes, delete</button><button class="save" data-nno="1">Keep it</button>':'<button class="save" data-nedit="'+n.id+'">Edit</button><button class="save" data-ndel="'+n.id+'">Delete</button>')+'</div></article>';
    }).join(""):'<div class="empty">'+(notes.length?'No notes match your search.':'No notes yet. After each lesson, write what you learned here.')+'</div>';
  }
  $("#tab-notes").addEventListener("submit",function(e){
    if(e.target.id!=="noteForm")return;e.preventDefault();
    var sid=$("#nSkill").value,title=$("#nTitle").value,text=$("#nText").value;
    if(noteEdit){
      var n=notes.filter(function(x){return x.id===noteEdit})[0];
      if(n&&String(text).trim().length>=3){n.skillId=sid;n.title=(String(title).trim()||String(text).trim().slice(0,40)).slice(0,80);n.text=String(text).trim().slice(0,4000);n.u=Date.now();save("sb4_notes",notes);noteEdit="";toast("Note updated");renderNotes()}
      else toast("Write a little more first");
    }else if(addNote(sid,title,text)){renderNotes()}
  });
  $("#tab-notes").addEventListener("click",function(e){
    var t=e.target,ed=t.closest("[data-nedit]"),dl=t.closest("[data-ndel]"),ys=t.closest("[data-nyes]"),no=t.closest("[data-nno]");
    if(ed){noteEdit=ed.dataset.nedit;renderNotes();window.scrollTo(0,0);return}
    if(dl){noteDel=dl.dataset.ndel;renderNoteList();return}
    if(no){noteDel="";renderNoteList();return}
    if(ys){var id=ys.dataset.nyes;notes=notes.filter(function(n){return n.id!==id});save("sb4_notes",notes);noteDel="";renderNoteList();renderPlayer();toast("Note deleted");return}
    if(t.id==="nCancel"){noteEdit="";renderNotes()}
  });
  $("#tab-notes").addEventListener("input",function(e){if(e.target.id==="nSearch"){noteQ=e.target.value;renderNoteList()}});
  $("#tab-notes").addEventListener("change",function(e){if(e.target.id==="nFilter"){noteSkill=e.target.value;renderNoteList()}});

  /* ---------- accounts (real on a server, device-only profile in preview) ---------- */
  var NAME_OK=/^[\p{L}][\p{L}\p{M} .'\-]{1,59}$/u,authMode=null,authTab="signin",authMsg="";
  function firstName(n){return String(n||"").split(" ")[0]}
  function renderHeader(){
    var b=$("#authBtn"),g=$("#greet"),f=auth?firstName(auth.user.name):"";
    b.textContent=auth?"Hello, "+f:"Sign in";b.setAttribute("aria-label",auth?"Account":"Sign in");
    if(auth){var st=streakInfo();g.textContent="Hello, "+f+". "+(st.cur?st.cur+"-day streak. Keep going!":"Ready to learn something today?");g.hidden=false}else g.hidden=true;
  }
  function openAuth(){
    $("#authModal").hidden=false;document.body.classList.add("modal-open");authMsg="";renderAuth();
    if(!authMode)fetch("/api/health").then(function(r){authMode=r.ok?"server":"local"}).catch(function(){authMode="local"}).then(renderAuth);
  }
  function closeAuth(){$("#authModal").hidden=true;document.body.classList.remove("modal-open")}
  function renderAuth(){
    var b=$("#authBox");
    if(auth){
      b.innerHTML='<h3 id="authTitle">Hello, '+esc(firstName(auth.user.name))+'</h3><p class="sub" style="margin:6px 0 12px">'+esc(auth.user.name)+(auth.user.email?'<br>'+esc(auth.user.email):'')+'</p><p class="note">'+(auth.mode==="server"?'Your progress, notes and certificates are saved to your account.':'Preview profile: saved on this device only.')+'</p><div class="actions"><button class="btn ghost" id="authOut">Sign out</button><button class="save" id="authClose">Close</button></div>';
      return;
    }
    if(!authMode){b.innerHTML='<p>One moment...</p>';return}
    var server=authMode==="server",su=authTab==="signup";
    b.innerHTML='<h3 id="authTitle">'+(server?(su?'Create your account':'Sign in'):'Create your profile')+'</h3>'+
      (server?'<div class="tabs"><button type="button" data-atab="signin" aria-selected="'+(!su)+'">Sign in</button><button type="button" data-atab="signup" aria-selected="'+su+'">Create account</button></div>':'<p class="note">Preview mode: your profile is saved on this device only. On your own server, real accounts keep your progress on every device.</p>')+
      '<form id="authForm" class="f" novalidate>'+((su||!server)?'<label>Full name<input id="aName" autocomplete="name" maxlength="60" placeholder="e.g. Abdulhafiz Olorunfemi"></label>':'')+
      (server?'<label>Email<input id="aEmail" type="email" autocomplete="email"></label><label>Password'+(su?' (at least 8 characters)':'')+'<input id="aPass" type="password" autocomplete="'+(su?'new-password':'current-password')+'"></label>':'')+
      '<button class="btn" type="submit">'+(server?(su?'Create account':'Sign in'):'Continue')+'</button><div class="note bad" id="authMsg" role="alert">'+esc(authMsg)+'</div></form><button class="save" id="authClose" style="margin-top:8px">Close</button>';
  }
  $("#authBox").addEventListener("click",function(e){
    var t=e.target,tb=t.closest("[data-atab]");
    if(tb){authTab=tb.dataset.atab;authMsg="";renderAuth();return}
    if(t.id==="authClose")closeAuth();
    if(t.id==="authOut")signOut(false);
  });
  $("#authBox").addEventListener("submit",function(e){e.preventDefault();doAuth()});
  $("#authBtn").addEventListener("click",openAuth);
  function doAuth(){
    var server=authMode==="server",su=authTab==="signup";
    var name=$("#aName")?String($("#aName").value||"").trim():"",email=$("#aEmail")?String($("#aEmail").value||"").trim():"",pw=$("#aPass")?String($("#aPass").value||""):"";
    function fail(m){authMsg=m;renderAuth()}
    if((su||!server)&&!NAME_OK.test(name))return fail("Enter your full name using letters only.");
    if(!server)return signedIn({token:"",user:{id:"local-"+name.toLowerCase().replace(/[^a-z0-9]+/g,"-"),name:name,email:""},mode:"local"});
    if(!/^\S+@\S+\.\S+$/.test(email))return fail("Enter a valid email address.");
    if(su&&pw.length<8)return fail("Use a password of at least 8 characters.");
    if(!pw)return fail("Enter your password.");
    apiPost(su?"/api/auth/register":"/api/auth/login",su?{name:name,email:email,password:pw}:{email:email,password:pw})
      .then(function(d){signedIn({token:d.token,user:d.user,mode:"server"})}).catch(function(err){fail(err.message)});
  }
  function copyGuest(){Object.keys(SYNCMAP).forEach(function(k){var g=rawGet("u:guest:"+k);if(g!==undefined&&load(k,undefined)===undefined)save(k,g)})}
  function signedIn(a){
    auth=a;curUid=a.user.id;try{localStorage.setItem("sb_auth",JSON.stringify(a))}catch(e){}
    function done(){closeAuth();reloadAll();toast("Welcome, "+firstName(a.user.name)+"!")}
    if(a.mode!=="server"){copyGuest();done();return}
    fetch("/api/state",{headers:{Authorization:"Bearer "+a.token}}).then(function(r){return r.ok?r.json():null}).then(function(d){
      if(d&&d.state&&Object.keys(d.state).length){Object.keys(SYNCMAP).forEach(function(k){var v=d.state[SYNCMAP[k]];if(v!==undefined)saveLocal(k,v)})}
      else{copyGuest();pushState()}
      done();
    }).catch(done);
  }
  function signOut(silent){
    auth=null;curUid="guest";try{localStorage.removeItem("sb_auth")}catch(e){}
    closeAuth();reloadAll();if(!silent)toast("Signed out");
  }
  function reloadAll(){
    saved=fix(load("sb2_saved",{}),{});apps=fix(load("sb2_apps",{}),{});
    stopTimer();ex=null;loadLearnState();view.skill="";view.track="";
    renderHeader();renderPlayer();coachStart();render();go(curPage||"home");showTab("coach");
  }

  /* ---------- dashboard ---------- */
  function renderDash(){
    var root=$("#dashRoot"),first=auth?firstName(auth.user.name):"",x=xp(),r=rank(x),nx=TITLES[r+1],base=TITLES[r][0],pv=nx?Math.round((x-base)/(nx[0]-base)*100):100,st=streakInfo();
    var learned=0;CAT.forEach(function(s){learned+=stepsDone(s)});Object.keys(pass).forEach(function(k){if(passed(k))learned++});
    var h='<div class="dhero"><div><div class="dsmall">'+(first?'Hello, '+esc(first)+'!':'Welcome!')+'</div><h3>'+esc(TITLES[r][1])+'</h3><div class="dsmall">Level '+(r+1)+', '+x+' XP'+(nx?', '+(nx[0]-x)+' XP to '+esc(nx[1]):'')+'</div></div><div class="dbar" role="progressbar" aria-valuenow="'+pv+'" aria-valuemin="0" aria-valuemax="100"><i style="width:'+pv+'%"></i></div></div>';
    if(!auth)h+='<div class="notice">Sign in so your progress, notes and certificates stay safe and follow you to any device. <button class="btn" data-auth="1">Sign in</button></div>';
    var dots="";
    for(var i=6;i>=0;i--){var d=new Date();d.setDate(d.getDate()-i);var on=meta.days.indexOf(iso(d))>-1;dots+='<div class="sday'+(on?' on':'')+(i===0?' now':'')+'"><span>'+"SMTWTFS".charAt(d.getDay())+'</span><b>'+(on?"&#10003;":"")+'</b></div>'}
    var msg=st.doneToday?"Great job! Today counts. Come back tomorrow to keep the fire alive.":(st.cur>0?"Learn something today to keep your "+st.cur+"-day streak alive!":"Learn something today to start your streak.");
    h+='<div class="dgrid"><div class="dcard streak"><div class="strow"><div class="flame" aria-hidden="true">&#128293;</div><div><div class="bignum">'+st.cur+'</div><div class="dsmall">day streak. Best: '+st.best+'</div></div></div><p><strong>'+esc(msg)+'</strong></p><p>Don\'t miss a day. You are on your journey to become great in your future.</p><div class="sdays">'+dots+'</div></div>';
    var items=act.filter(function(a){return a.type==="learn"||a.type==="pass"||a.type==="cert"||a.type==="note"}).slice(0,6),ic={learn:"&#9989;",pass:"&#127941;",cert:"&#127891;",note:"&#128221;"};
    h+='<div class="dcard learned"><h3>'+(learned?'&#127881; You learned '+learned+' new skill'+(learned===1?'':'s')+'!':'Your first new skill is waiting')+'</h3>'+
      (items.length?'<ul class="feed">'+items.map(function(a){var s=a.skillId?sk(a.skillId):null;return '<li><span aria-hidden="true">'+ic[a.type]+'</span><div>'+esc(a.text)+'<div class="meta">'+(s?esc(s.name)+', ':'')+esc(ago(a.t))+'</div></div></li>'}).join("")+'</ul>':'<p class="meta">Tick a roadmap step, pass a test or write a note and it shows up here.</p>')+
      '<div class="actions"><button class="btn" data-focusnote="1">I learned something new</button></div></div>';
    h+='<div class="dcard notes"><h3>&#128221; What did you learn today?</h3><form class="f" id="dqForm" style="max-width:none"><label>Skill<select id="dqSkill">'+skillSel("","General")+'</select></label><label>Explain it in your own words<textarea id="dqText" rows="3" maxlength="4000" placeholder="Today I learned..."></textarea></label><button class="btn" type="submit">Save note</button></form>'+
      (notes.length?'<ul class="feed" style="margin-top:10px">'+notes.slice(0,3).map(function(n){return '<li><span aria-hidden="true">&#128221;</span><div><strong>'+esc(n.title)+'</strong><div class="meta">'+esc(ago(n.u))+'</div></div></li>'}).join("")+'</ul>':'')+
      '<div class="actions"><button class="save" data-allnotes="1">Open all notes ('+notes.length+')</button></div></div>';
    var started=CAT.filter(function(s){return stepsDone(s)>0||s.tracks.some(function(t){return t.topics.some(function(tp){return pass[tp.id]})})});
    h+='<div class="dcard progress"><h3>&#128200; My skills</h3>'+(started.length?started.map(function(s){var d=stepsDone(s),t=stepsTotal(s),np=0,nt=0;s.tracks.forEach(function(tr){tr.topics.forEach(function(tp){nt++;if(passed(tp.id))np++})});return '<div class="prow"><div><strong>'+esc(s.icon+" "+s.name)+'</strong><div class="prog"><i style="width:'+Math.round(d/t*100)+'%"></i></div><div class="meta">Roadmap '+Math.round(d/t*100)+'%. Tests passed '+np+' of '+nt+'.</div></div><button class="save" data-open="'+s.id+'">Continue</button></div>'}).join(""):'<p class="meta">You have not started a skill yet.</p><div class="actions"><button class="btn" data-open="">Pick a skill</button></div>')+'</div>';
    h+='<div class="dcard certs"><h3>&#127891; My certificates</h3>'+(certs.length?certs.map(function(c,i){return '<div class="row"><span>'+esc(c.trackName)+'<br><span class="meta">'+esc(fmtDate(c.date))+'</span></span><button class="save" data-cert="'+i+'">View</button></div>'}).join(""):'<p class="meta">Pass every test in a path to earn your first certificate.</p>')+'</div>';
    var sj=Object.keys(saved).map(function(k){return saved[k]}),ak=Object.keys(apps).filter(function(k){return apps[k]&&apps[k].job});
    h+='<div class="dcard jobs"><h3>&#128188; Jobs</h3><div class="meta">Saved jobs</div>'+(sj.length?sj.map(function(j){var u=safeUrl(j.url);return '<div class="row"><span>'+esc(j.title)+'<br><span class="meta">'+esc(j.company)+'</span></span>'+(u?'<a href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">Open</a>':'')+'</div>'}).join(""):'<p class="meta">No saved jobs yet.</p>')+
      '<div class="meta" style="margin-top:10px">Applications</div>'+(ak.length?ak.map(function(k){var a=apps[k];return '<div class="row"><span>'+esc(a.job.title)+'<br><span class="meta">'+esc(a.job.company)+'</span></span><select data-status="'+esc(k)+'" aria-label="Status for '+esc(a.job.title)+'">'+STATUSES.map(function(s2){return '<option'+(a.status===s2?' selected':'')+'>'+s2+'</option>'}).join("")+'</select></div>'}).join(""):'<p class="meta">No applications tracked yet.</p>')+'</div></div>';
    root.innerHTML=h;
  }
  $("#dashRoot").addEventListener("click",function(e){
    var t=e.target,a=t.closest("[data-auth]"),o=t.closest("[data-open]"),c=t.closest("[data-cert]");
    if(a){openAuth();return}
    if(o){go("skills");if(o.dataset.open)goSkill(o.dataset.open,"road");else showTab("skills");return}
    if(c){showCert(certs[+c.dataset.cert]);return}
    if(t.closest("[data-allnotes]")){go("skills");showTab("notes");return}
    if(t.closest("[data-focusnote]")){var ta=$("#dqText");if(ta&&ta.focus)ta.focus()}
  });
  $("#dashRoot").addEventListener("submit",function(e){
    if(e.target.id!=="dqForm")return;e.preventDefault();
    if(addNote($("#dqSkill").value,"",$("#dqText").value))renderDash();
  });
  $("#dashRoot").addEventListener("change",function(e){var k=e.target.dataset&&e.target.dataset.status;if(k&&apps[k]){apps[k].status=e.target.value;save("sb2_apps",apps);toast("Status updated")}});


  /* ---------- contact ---------- */
  $("#cForm").addEventListener("submit",function(e){
    e.preventDefault();
    var f=e.target,n=f.name.value.trim(),m=f.email.value.trim(),b=f.message.value.trim(),note=$("#cNote");
    if(!n||!/^\S+@\S+\.\S+$/.test(m)||!b){note.innerHTML='<span class="bad">Enter your name, a valid email and a message.</span>';return}
    note.textContent="Sending...";
    fetch("/api/contact",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:n,email:m,message:b})})
      .then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||"Could not send");return d})})
      .then(function(){note.innerHTML='<span class="ok">Message sent. We will reply by email.</span>';f.reset()})
      .catch(function(err){note.innerHTML='<span class="bad">Could not send: '+esc(err.message)+'. This works once the server is running. You can also email lawalolorunifemi@gmail.com.</span>'});
  });

  renderHeader();renderPlayer();coachStart();go("home");
  cur.jobs=sampleFilter();render();handleVerifyParam();
})();
