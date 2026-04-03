import React, { useState, useEffect, useRef, useCallback, Component } from 'react';
import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, getDocs, addDoc, doc, updateDoc,
  getDoc, setDoc, query, where, deleteDoc
} from "firebase/firestore";
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInAnonymously, onAuthStateChanged, signOut, updateProfile
} from "firebase/auth";
import './App.css';

// ─── Error Boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(p){super(p);this.state={err:null};}
  static getDerivedStateFromError(e){return{err:e};}
  componentDidCatch(e,i){console.error('App Error:',e,i);}
  render(){
    if(this.state.err) return(
      <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'#f4fbf6',padding:30,textAlign:'center',fontFamily:'sans-serif'}}>
        <div style={{fontSize:60,marginBottom:16}}>⚠️</div>
        <h2 style={{color:'#1a7a43',marginBottom:12}}>কিছু একটা সমস্যা হয়েছে</h2>
        <p style={{color:'#666',marginBottom:24,fontSize:13}}>{this.state.err?.message}</p>
        <button onClick={()=>window.location.reload()} style={{background:'#27ae60',color:'#fff',border:'none',padding:'12px 28px',borderRadius:10,fontSize:15,fontWeight:700,cursor:'pointer'}}>পুনরায় চেষ্টা করুন</button>
      </div>
    );
    return this.props.children;
  }
}

// ─── Firebase ──────────────────────────────────────────────────────────────────
const FB = initializeApp({
  apiKey:"AIzaSyBSKT0kmhfyLHSur-Z8nnj3jrYn2KBcP0M",
  authDomain:"sakib-store1.firebaseapp.com",
  projectId:"sakib-store1",
  storageBucket:"sakib-store1.firebasestorage.app",
  messagingSenderId:"514373347826",
  appId:"1:514373347826:web:a778be5386cd5362d1636b"
});
const db=getFirestore(FB), auth=getAuth(FB), gp=new GoogleAuthProvider();

// ─── Constants ─────────────────────────────────────────────────────────────────
const CATS=['সব পণ্য','পাইকারি','চাল','ডাল','তেল','মসলা','পানীয়','অন্যান্য'];
const DLOCS=["গোবিন্দল","সিংগাইর বাজার","নীলটেক","পুকুরপাড়া","ঘোনাপাড়া","বকচর","সিংগাইর উপজেলার ভেতরে","নিজে লেখুন"];
const EMOJIS=['👨','👩','👦','👧','🧔','👱','👴','👵','🧑','👮','👷','🧑‍🌾','🧑‍🍳','🧑‍💼','🦸','😊','😎','🥳','🤩','🐱','🐶','🦊','🐼','🐨','🦁','🐯','🦄','🐸','🌟','🎯','🚀','🎵','🌈'];

// Beautiful default gradient covers
const DEFAULT_COVERS=[
  'linear-gradient(135deg,#1a7a43,#27ae60)',
  'linear-gradient(135deg,#0f3460,#16213e)',
  'linear-gradient(135deg,#e74c3c,#c0392b)',
  'linear-gradient(135deg,#8e44ad,#6c3483)',
  'linear-gradient(135deg,#e67e22,#d35400)',
  'linear-gradient(135deg,#2980b9,#1a5276)',
];

const DEFINFO={name:'',phone:'',locationType:'গোবিন্দল',district:'মানিকগঞ্জ',area:'সিংগাইর',address:'',paymentMethod:'Cash on Delivery',senderNumber:'',transactionId:'',profileEmoji:'👤',coverPhoto:'',coverIsGradient:true,coverGradient:'linear-gradient(135deg,#1a7a43,#27ae60)'};

// ─── Helpers ───────────────────────────────────────────────────────────────────
const parseUnit=u=>{
  if(!u) return{baseQty:1,text:'টি',step:1};
  try{
    const s=String(u).replace(/[০-৯]/g,d=>'০১২৩৪৫৬৭৮৯'.indexOf(d));
    const m=s.match(/^([\d.]+)\s*(.*)$/);
    if(m){const n=parseFloat(m[1]),t=m[2]?.trim()||'টি';const step=(t.includes('গ্রাম')||t.includes('gm')||t.includes('মিলি')||t.includes('ml'))?(n>=100?50:10):1;return{baseQty:n,text:t,step};}
  }catch(_){}
  return{baseQty:1,text:u,step:1};
};
const bn=n=>{try{if(n==null||n===''||isNaN(n)) return '০';return Number(n).toFixed(0).replace(/\d/g,d=>'০১২৩৪৫৬৭৮৯'[d]);}catch(_){return String(n);}};
const getDC=loc=>{if(["গোবিন্দল","সিংগাইর বাজার","নীলটেক","পুকুরপাড়া","ঘোনাপাড়া","বকচর"].includes(loc))return 20;if(loc==="সিংগাইর উপজেলার ভেতরে")return 40;return 50;};
const stCls=s=>({Pending:'st-pending',Confirmed:'st-confirmed','On Delivery':'st-delivery',Delivered:'st-delivered',Cancelled:'st-cancelled'}[s]||'st-pending');

// ─── Main App ──────────────────────────────────────────────────────────────────
function AppInner(){
  const [products,setProducts]=useState([]);
  const [headerImg,setHeaderImg]=useState('https://placehold.co/820x312/1a7a43/ffffff?text=Sakib+Store');
  const [notice,setNotice]=useState('সাকিব স্টোরে আপনাকে স্বাগতম! 🌿 সেরা মানের পণ্য, সাশ্রয়ী মূল্যে।');
  const [notif,setNotif]=useState({text:'',expiresAt:0,show:false});
  const [coverPhotos,setCoverPhotos]=useState([]);
  const [showNotifModal,setShowNotifModal]=useState(false);
  const [showEmojiPicker,setShowEmojiPicker]=useState(false);
  const [showCoverPicker,setShowCoverPicker]=useState(false);
  const [showLogoutConfirm,setShowLogoutConfirm]=useState(false);
  const [appReady,setAppReady]=useState(false);

  // Nav
  const [tab,setTab]=useState('home');
  const [tabHist,setTabHist]=useState(['home']);
  const [mode,setMode]=useState('customer');
  const [drawer,setDrawer]=useState(false);
  const [homeCat,setHomeCat]=useState('সব পণ্য');
  const [search,setSearch]=useState('');
  const [catSel,setCatSel]=useState('সব পণ্য');

  // Auth
  const [user,setUser]=useState(null);
  const [cart,setCart]=useState([]);
  const [userOrders,setUserOrders]=useState([]);
  const [customLoc,setCustomLoc]=useState('');
  const [info,setInfo]=useState({...DEFINFO});

  // Auth modal
  const [authMode,setAuthMode]=useState('choice'); // 'choice'|'email-login'|'email-register'
  const [emailInput,setEmailInput]=useState('');
  const [passInput,setPassInput]=useState('');
  const [nameInput,setNameInput]=useState('');
  const [authLoading,setAuthLoading]=useState(false);

  // Admin
  const [adminPass,setAdminPass]=useState('');
  const [allOrders,setAllOrders]=useState([]);
  const [adminLoading,setAdminLoading]=useState(false);
  const [adminErr,setAdminErr]=useState('');
  const [adminFilter,setAdminFilter]=useState('All');
  const [adminTab,setAdminTab]=useState('stock'); // FIX: default to stock tab
  const [editId,setEditId]=useState(null);
  const [newP,setNewP]=useState({name:'',price:'',image:'',category:'পাইকারি',stock:100,unit:'১ কেজি'});
  const [newNotif,setNewNotif]=useState({text:'',durationMins:60});
  const [newCoverUrl,setNewCoverUrl]=useState('');

  const [toast,setToast]=useState(null);
  const showToast=useCallback((msg,type='success')=>{setToast({msg,type});setTimeout(()=>setToast(null),3000);},[]);
  const backTime=useRef(0);

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(()=>{
    loadProducts();
    loadSettings();

    // FIX: NO getRedirectResult — causes crash in WebView / partitioned storage
    const unsub=onAuthStateChanged(auth,cu=>{
      try{
        if(cu){
          setUser({id:cu.uid,isAnon:cu.isAnonymous,email:cu.email,name:cu.displayName});
          loadUserData(cu.uid);
        }else{
          setUser(null);
          try{const d=localStorage.getItem('guestInfo');if(d)setInfo(p=>({...p,...JSON.parse(d)}));}catch(_){}
        }
      }catch(e){console.error('auth state:',e);}
      setAppReady(true);
    },err=>{console.error('auth err:',err);setAppReady(true);});

    window.history.pushState(null,null,window.location.pathname);
    const onPop=()=>{
      window.history.pushState(null,null,window.location.pathname);
      if(drawer){setDrawer(false);return;}
      setTabHist(prev=>{
        if(prev.length>1){const n=[...prev];n.pop();setTab(n[n.length-1]);return n;}
        const now=Date.now();
        if(now-backTime.current<2000)window.close();
        else{backTime.current=now;showToast('আবার Back চাপলে বের হবে','warning');}
        return prev;
      });
    };
    window.addEventListener('popstate',onPop);
    return()=>{try{unsub();}catch(_){}window.removeEventListener('popstate',onPop);};
  // eslint-disable-next-line
  },[]);

  const goto=t=>{setTab(t);setTabHist(p=>[...p,t]);window.scrollTo(0,0);};

  // ── Data ────────────────────────────────────────────────────────────────────
  const loadProducts=async()=>{
    try{const s=await getDocs(collection(db,'products'));setProducts(s.docs.map(d=>({id:d.id,...d.data()})));}
    catch(e){console.error('loadProducts',e);}
  };

  const loadSettings=async()=>{
    try{
      const s=await getDoc(doc(db,'settings','general'));
      if(s.exists()){
        const d=s.data();
        if(d.header)setHeaderImg(d.header);
        if(d.notice)setNotice(d.notice);
        if(d.notification)setNotif({...d.notification,show:Date.now()<=d.notification.expiresAt});
        // FIX: load coverPhotos from Firestore
        if(Array.isArray(d.coverPhotos))setCoverPhotos(d.coverPhotos);
      }
    }catch(e){console.error('loadSettings',e);}
  };

  const loadUserData=async uid=>{
    try{
      const u=await getDoc(doc(db,'users',uid));
      if(u.exists()&&u.data().info)setInfo(p=>({...DEFINFO,...p,...u.data().info}));
      const o=await getDocs(query(collection(db,'orders'),where('userId','==',uid)));
      setUserOrders(o.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>b.timestamp-a.timestamp));
    }catch(e){console.error('loadUserData',e);}
  };

  // ── Auth ────────────────────────────────────────────────────────────────────
  // FIX: Google popup only — no redirect, no sessionStorage issue
  const googleLogin=async()=>{
    setAuthLoading(true);
    try{
      const r=await signInWithPopup(auth,gp);
      if(r?.user){showToast('গুগল লগইন সফল! ✅');setAuthMode('choice');goto('home');}
    }catch(e){
      const code=e?.code||'';
      if(code==='auth/unauthorized-domain'){
        showToast('Domain অনুমোদিত নয়! Firebase Console → Auth → Settings → Authorized Domains-এ আপনার site URL যোগ করুন।','error');
      }else if(code==='auth/popup-blocked'){
        showToast('Popup block হয়েছে — browser-এ popup allow করুন।','error');
      }else if(code==='auth/cancelled-popup-request'||code==='auth/popup-closed-by-user'){
        // user closed — silent
      }else{
        showToast('লগইন সমস্যা: '+code,'error');
      }
    }
    setAuthLoading(false);
  };

  // FIX: Email login / register
  const emailLogin=async()=>{
    if(!emailInput||!passInput)return showToast('ইমেইল ও পাসওয়ার্ড দিন!','error');
    setAuthLoading(true);
    try{
      await signInWithEmailAndPassword(auth,emailInput,passInput);
      showToast('লগইন সফল! ✅');setAuthMode('choice');setEmailInput('');setPassInput('');
    }catch(e){
      if(e.code==='auth/user-not-found')showToast('এই ইমেইলে কোনো অ্যাকাউন্ট নেই।','error');
      else if(e.code==='auth/wrong-password'||e.code==='auth/invalid-credential')showToast('পাসওয়ার্ড ভুল।','error');
      else showToast('সমস্যা: '+e.code,'error');
    }
    setAuthLoading(false);
  };

  const emailRegister=async()=>{
    if(!emailInput||!passInput||!nameInput)return showToast('নাম, ইমেইল ও পাসওয়ার্ড দিন!','error');
    if(passInput.length<6)return showToast('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।','error');
    setAuthLoading(true);
    try{
      const r=await createUserWithEmailAndPassword(auth,emailInput,passInput);
      await updateProfile(r.user,{displayName:nameInput});
      showToast('নতুন অ্যাকাউন্ট তৈরি হয়েছে! ✅');setAuthMode('choice');setEmailInput('');setPassInput('');setNameInput('');
    }catch(e){
      if(e.code==='auth/email-already-in-use')showToast('এই ইমেইল আগে থেকে ব্যবহার হচ্ছে।','error');
      else showToast('সমস্যা: '+e.code,'error');
    }
    setAuthLoading(false);
  };

  const guestLogin=async()=>{
    try{await signInAnonymously(auth);showToast('গেস্ট হিসেবে প্রবেশ করেছেন!');}
    catch(e){showToast('সমস্যা: '+(e?.message||''),'error');}
  };

  // FIX: Logout confirmation
  const confirmLogout=()=>setShowLogoutConfirm(true);
  const doLogout=async()=>{
    setShowLogoutConfirm(false);
    try{await signOut(auth);}catch(_){}
    setInfo({...DEFINFO});setCart([]);setUserOrders([]);
    localStorage.removeItem('guestInfo');
    goto('home');
  };

  // ── Profile ─────────────────────────────────────────────────────────────────
  const saveProfile=async(data=info)=>{
    try{
      if(user&&!user.isAnon){
        await setDoc(doc(db,'users',user.id),{info:data},{merge:true});
        showToast('প্রোফাইল আপডেট! ✅');
      }else{
        // FIX: Guest data persists in localStorage until logout
        localStorage.setItem('guestInfo',JSON.stringify(data));
        showToast('তথ্য সাময়িকভাবে সেভ হয়েছে।');
      }
    }catch(e){showToast('সেভ সমস্যা','error');}
  };

  // ── Cart ────────────────────────────────────────────────────────────────────
  const cartAction=(product,action)=>{
    if(action==='add'&&product.stock<=0){showToast('এই পণ্যের স্টক শেষ!','error');return;}
    const{baseQty,step}=parseUnit(product.unit);
    setCart(prev=>{
      const ex=prev.find(i=>i.id===product.id);
      if(action==='add'){
        if(ex){if((ex.qty+step)>product.stock*baseQty){showToast('স্টকের বেশি অর্ডার সম্ভব নয়!','error');return prev;}return prev.map(i=>i.id===product.id?{...i,qty:i.qty+step}:i);}
        return[...prev,{...product,qty:baseQty}];
      }
      if(action==='remove'&&ex){if(ex.qty>baseQty)return prev.map(i=>i.id===product.id?{...i,qty:i.qty-step}:i);return prev.filter(i=>i.id!==product.id);}
      return prev;
    });
  };
  const cartTotal=cart.reduce((a,i)=>a+(i.price/parseUnit(i.unit).baseQty)*i.qty,0);
  const dCharge=cart.length>0?getDC(info.locationType):0;
  const finalTotal=cartTotal+dCharge;

  const submitOrder=async()=>{
    if(!info.name||!info.phone||!info.district||!info.area||!info.address)return showToast('ডেলিভারির সকল তথ্য দিন!','error');
    const loc=info.locationType==='নিজে লেখুন'?customLoc:info.locationType;
    if(info.locationType==='নিজে লেখুন'&&!customLoc)return showToast('জায়গার নাম লিখুন!','error');
    if((info.paymentMethod==='Bkash'||info.paymentMethod==='Nogod')&&(!info.senderNumber||!info.transactionId))return showToast('সেন্ডার নম্বর ও TrxID দিন!','error');
    try{
      await addDoc(collection(db,'orders'),{items:cart,userInfo:{...info,finalLocation:loc},userId:user?.id||'Guest_'+Date.now(),paymentMethod:info.paymentMethod,total:finalTotal,status:'Pending',date:new Date().toLocaleString('bn-BD'),timestamp:Date.now()});
      for(const item of cart){const{baseQty}=parseUnit(item.unit);await updateDoc(doc(db,'products',item.id),{stock:Math.max(0,item.stock-item.qty/baseQty)});}
      if(user&&!user.isAnon)await setDoc(doc(db,'users',user.id),{info},{merge:true});
      showToast('অর্ডার সফল! 🎉');setCart([]);loadProducts();goto('profile');
      if(user)loadUserData(user.id);
    }catch(e){showToast('সমস্যা: '+(e?.message||''),'error');}
  };

  // ── Admin ────────────────────────────────────────────────────────────────────
  // FIX: Completely safe fetchOrders with granular error handling
  const fetchOrders=async()=>{
    setAdminLoading(true);setAdminErr('');
    try{
      const controller=new AbortController();
      const timeoutId=setTimeout(()=>controller.abort(),10000);
      const snap=await getDocs(collection(db,'orders'));
      clearTimeout(timeoutId);
      setAllOrders(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.timestamp||0)-(a.timestamp||0)));
    }catch(e){
      const code=String(e?.code||e?.message||'');
      if(code.includes('permission')||code.includes('PERMISSION'))setAdminErr('RULES');
      else if(code.includes('abort')||code.includes('timeout'))setAdminErr('TIMEOUT');
      else setAdminErr('ERR:'+code);
    }finally{setAdminLoading(false);}
  };

  const saveProduct=async()=>{
    if(!newP.name||!newP.price)return showToast('নাম ও দাম দিন!','error');
    try{
      if(editId){await updateDoc(doc(db,'products',editId),{...newP,price:Number(newP.price),stock:Number(newP.stock)});showToast('পণ্য আপডেট! ✅');}
      else{await addDoc(collection(db,'products'),{...newP,price:Number(newP.price),stock:Number(newP.stock)});showToast('পণ্য যোগ! ✅');}
      setEditId(null);setNewP({name:'',price:'',image:'',category:'পাইকারি',stock:100,unit:'১ কেজি'});loadProducts();
    }catch(e){showToast(e?.message||'সমস্যা','error');}
  };

  const sendNotif=async()=>{
    if(!newNotif.text)return;
    const nd={text:newNotif.text,expiresAt:Date.now()+newNotif.durationMins*60000};
    try{await setDoc(doc(db,'settings','general'),{notification:nd},{merge:true});setNotif({...nd,show:true});showToast('নোটিফিকেশন পাঠানো হয়েছে! ✅');setNewNotif({text:'',durationMins:60});}
    catch(e){showToast('সমস্যা','error');}
  };

  const saveSettings=async()=>{
    try{await setDoc(doc(db,'settings','general'),{header:headerImg,notice},{merge:true});showToast('সেটিংস সেভ! ✅');}
    catch(e){showToast('সমস্যা','error');}
  };

  // FIX: Cover photos persist in Firestore
  const addCoverPhoto=async()=>{
    if(!newCoverUrl.trim())return;
    const updated=[...coverPhotos,newCoverUrl.trim()];
    setCoverPhotos(updated);setNewCoverUrl('');
    try{await setDoc(doc(db,'settings','general'),{coverPhotos:updated},{merge:true});showToast('কভার ফটো যোগ! ✅');}
    catch(e){showToast('সমস্যা','error');}
  };
  const removeCoverPhoto=async idx=>{
    const updated=coverPhotos.filter((_,i)=>i!==idx);
    setCoverPhotos(updated);
    try{await setDoc(doc(db,'settings','general'),{coverPhotos:updated},{merge:true});showToast('মুছে ফেলা হয়েছে।');}
    catch(e){showToast('সমস্যা','error');}
  };

  const filtered=products.filter(p=>{const c=homeCat==='সব পণ্য'||p.category===homeCat;const s=!search||p.name.toLowerCase().includes(search.toLowerCase());return c&&s;});
  const isHome=tab==='home';

  // Product Card
  const PCard=({p})=>{
    const ci=cart.find(x=>x.id===p.id);
    const{baseQty}=parseUnit(p.unit);
    const price=ci?(p.price/baseQty)*ci.qty:p.price;
    const out=p.stock<=0;
    return(
      <div className={`product-card ${out?'out-of-stock':''}`}>
        <div className="p-img-box"><img src={p.image||'https://placehold.co/120x120/e8f5e9/27ae60?text=P'} alt={p.name} onError={e=>{e.target.src='https://placehold.co/120x120/e8f5e9/27ae60?text=P';}}/></div>
        {out&&<div className="out-badge">স্টক শেষ</div>}
        <h4 className="p-name">{p.name}</h4>
        <p className="p-price">৳{bn(price)}</p>
        <p className="p-unit">{p.unit}</p>
        {!out&&<p className="p-stock">স্টক: {bn(p.stock)}</p>}
        <div className="p-action">
          {out?(<button className="btn-add disabled" disabled>স্টক নেই</button>):ci?(
            <div className="qty-controls">
              <button className="btn-minus" onClick={()=>cartAction(p,'remove')}>-</button>
              <span className="qty-text">{bn(ci.qty)}</span>
              <button className="btn-plus" onClick={()=>cartAction(p,'add')}>+</button>
            </div>
          ):(<button className="btn-add" onClick={()=>cartAction(p,'add')}>যোগ করুন</button>)}
        </div>
      </div>
    );
  };

  if(!appReady)return(
    <div className="splash-screen">
      <div className="splash-logo">🌿</div>
      <h2>সাকিব স্টোর</h2>
      <div className="splash-spinner"/>
    </div>
  );

  // ══════ ADMIN LOGIN ══════
  if(mode==='adminLogin')return(
    <div className="fullscreen-center">
      {toast&&<div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      <div className="admin-login-box">
        <div className="admin-logo">🛡️</div>
        <h2>অ্যাডমিন লগইন</h2>
        <input type="password" className="admin-input" placeholder="পাসওয়ার্ড দিন..." value={adminPass} onChange={e=>setAdminPass(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter'){if(adminPass==='sakib123'){setMode('admin');setAdminTab('stock');setAdminPass('');}else showToast('ভুল পাসওয়ার্ড!','error');}}}/>
        <button className="btn-primary" onClick={()=>{if(adminPass==='sakib123'){setMode('admin');setAdminTab('stock');setAdminPass('');}else showToast('ভুল পাসওয়ার্ড!','error');}}>লগইন</button>
        <button className="btn-outline mt-10" onClick={()=>{setMode('customer');goto('home');}}>← ফিরে যান</button>
      </div>
    </div>
  );

  // ══════ ADMIN PANEL ══════
  // FIX: Stock & Settings LEFT, Orders RIGHT
  if(mode==='admin')return(
    <div className="admin-wrapper">
      {toast&&<div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      <header className="admin-header">
        <button className="admin-back-btn" onClick={()=>{setMode('customer');goto('home');}}>← বের হোন</button>
        <h2>অ্যাডমিন ড্যাশবোর্ড</h2>
        <span/>
      </header>

      {/* FIX: Stock on LEFT (index 0), Orders on RIGHT (index 1) */}
      <div className="admin-tabs">
        <button className={adminTab==='stock'?'active':''} onClick={()=>setAdminTab('stock')}>📊 স্টক ও সেটিংস</button>
        <button className={adminTab==='orders'?'active':''} onClick={()=>{setAdminTab('orders');fetchOrders();}}>📦 অর্ডারসমূহ</button>
      </div>

      <div className="admin-content">

        {/* ── STOCK & SETTINGS (default) ── */}
        {adminTab==='stock'&&(<>
          <div className="admin-grid-layout">
            <div className="admin-col">
              <div className="admin-card">
                <h4>🖼️ হেডার ছবি (URL)</h4>
                <input type="text" placeholder="ছবির লিঙ্ক..." value={headerImg} onChange={e=>setHeaderImg(e.target.value)}/>
                {headerImg&&<img src={headerImg} alt="preview" style={{width:'100%',height:70,objectFit:'cover',borderRadius:8,marginTop:8}} onError={e=>{e.target.style.display='none';}}/>}
                <h4 className="mt-15">📢 চলমান নোটিশ</h4>
                <textarea placeholder="নোটিশ লিখুন..." value={notice} onChange={e=>setNotice(e.target.value)}/>
                <button className="btn-primary mt-10" onClick={saveSettings}>সেভ করুন</button>
              </div>
              <div className="admin-card">
                <h4>🔔 পুশ নোটিফিকেশন</h4>
                <input type="text" placeholder="নোটিফিকেশন মেসেজ..." value={newNotif.text} onChange={e=>setNewNotif({...newNotif,text:e.target.value})}/>
                <input type="number" className="mt-10" placeholder="কত মিনিট স্থায়ী?" value={newNotif.durationMins} onChange={e=>setNewNotif({...newNotif,durationMins:+e.target.value})}/>
                <button className="btn-warning mt-10" onClick={sendNotif}>সেন্ড করুন</button>
              </div>
              {/* FIX: Cover Photos management */}
              <div className="admin-card">
                <h4>🖼️ কভার ফটো ম্যানেজমেন্ট</h4>
                <p style={{fontSize:12,color:'var(--muted)',marginBottom:8}}>গ্রাহকরা এখান থেকে কভার বেছে নেবে। URL যোগ করুন।</p>
                <div style={{display:'flex',gap:8,marginBottom:10}}>
                  <input type="text" placeholder="ছবির URL..." value={newCoverUrl} onChange={e=>setNewCoverUrl(e.target.value)}
                    style={{flex:1,padding:'8px 12px',border:'1.5px solid var(--border)',borderRadius:9,fontFamily:'var(--font)',fontSize:13,background:'var(--green-pale)',outline:'none'}}
                    onKeyDown={e=>{if(e.key==='Enter')addCoverPhoto();}}/>
                  <button className="btn-primary" style={{width:'auto',padding:'8px 14px'}} onClick={addCoverPhoto}>যোগ</button>
                </div>
                <div className="cover-admin-grid">
                  {coverPhotos.length===0&&<p style={{fontSize:12,color:'var(--muted)'}}>কোনো কভার ফটো নেই।</p>}
                  {coverPhotos.map((url,i)=>(
                    <div key={i} className="cover-admin-item">
                      <img src={url} alt="" onError={e=>{e.target.src='https://placehold.co/80x40/e8f5e9/27ae60?text=err';}}/>
                      <button onClick={()=>removeCoverPhoto(i)}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="admin-col">
              <div className="admin-card">
                <h3 className="text-green">{editId?"✏️ এডিট পণ্য":"➕ নতুন পণ্য"}</h3>
                <input type="text" placeholder="পণ্যের নাম" className="mb-10" value={newP.name} onChange={e=>setNewP({...newP,name:e.target.value})}/>
                <div style={{display:'flex',gap:8,marginBottom:10}}>
                  <input type="number" placeholder="দাম (৳)" value={newP.price} onChange={e=>setNewP({...newP,price:e.target.value})}/>
                  <input type="text" placeholder="পরিমাণ (১ কেজি...)" value={newP.unit} onChange={e=>setNewP({...newP,unit:e.target.value})}/>
                </div>
                <div style={{display:'flex',gap:8,marginBottom:10}}>
                  <select value={newP.category} onChange={e=>setNewP({...newP,category:e.target.value})}>{CATS.filter(c=>c!=='সব পণ্য').map(c=><option key={c}>{c}</option>)}</select>
                  <input type="number" placeholder="স্টক" value={newP.stock} onChange={e=>setNewP({...newP,stock:e.target.value})}/>
                </div>
                <input type="text" placeholder="ছবির URL" className="mb-10" value={newP.image} onChange={e=>setNewP({...newP,image:e.target.value})}/>
                {newP.image&&<img src={newP.image} alt="" style={{width:'100%',height:60,objectFit:'cover',borderRadius:8,marginBottom:8}} onError={e=>{e.target.style.display='none';}}/>}
                <div style={{display:'flex',gap:8}}>
                  <button className="btn-primary flex-1" onClick={saveProduct}>{editId?"আপডেট":"যোগ করুন"}</button>
                  {editId&&<button className="btn-danger" onClick={()=>{setEditId(null);setNewP({name:'',price:'',image:'',category:'পাইকারি',stock:100,unit:'১ কেজি'});}}>বাতিল</button>}
                </div>
              </div>
            </div>
          </div>

          <h3 className="section-title mt-20">স্টক লিস্ট</h3>
          <div className="stock-list-grid">
            {products.map(p=>(
              <div key={p.id} className="stock-item-row">
                <img src={p.image||'https://placehold.co/50x50/27ae60/fff?text=P'} alt={p.name} onError={e=>{e.target.src='https://placehold.co/50x50/27ae60/fff?text=P';}}/>
                <div className="si-details"><strong>{p.name}</strong><p>৳{p.price}/{p.unit} | স্টক: <span style={{color:p.stock<=5?'#e74c3c':'inherit',fontWeight:700}}>{p.stock}</span></p></div>
                <button className="btn-edit" onClick={()=>{setEditId(p.id);setNewP({...p,price:String(p.price),stock:String(p.stock)});window.scrollTo(0,0);}}>Edit</button>
                <button className="btn-del" onClick={async()=>{if(window.confirm("ডিলিট করবেন?")){try{await deleteDoc(doc(db,'products',p.id));loadProducts();}catch(e){showToast('সমস্যা','error');}}}}>Del</button>
              </div>
            ))}
          </div>
        </>)}

        {/* ── ORDERS (right tab) ── */}
        {adminTab==='orders'&&(<>
          <div className="admin-orders-header">
            <h3 className="section-title">অর্ডার ম্যানেজমেন্ট</h3>
            <button className="btn-refresh" onClick={fetchOrders}>↻ রিফ্রেশ</button>
          </div>
          <div className="order-filters">
            {['All','Pending','Confirmed','On Delivery','Delivered','Cancelled'].map(s=>(
              <button key={s} className={adminFilter===s?'active':''} onClick={()=>setAdminFilter(s)}>{s}</button>
            ))}
          </div>
          {adminLoading?(
            <div className="admin-loading-box"><div className="admin-spinner"/><p>লোড হচ্ছে...</p></div>
          ):adminErr?(
            <div className="admin-error-box">
              {adminErr==='RULES'?(<>
                <div style={{fontSize:36,marginBottom:10}}>🔒</div>
                <p style={{fontWeight:700,marginBottom:8}}>Firestore Security Rules সমস্যা</p>
                <div className="rules-code">{`rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /{document=**} {\n      allow read, write: if true;\n    }\n  }\n}`}</div>
                <button className="btn-primary mt-15" style={{width:'auto',padding:'10px 24px'}} onClick={fetchOrders}>আবার চেষ্টা</button>
              </>):adminErr==='TIMEOUT'?(<>
                <div style={{fontSize:36,marginBottom:10}}>⏱️</div>
                <p style={{fontWeight:700}}>সংযোগ ধীর বা নেই</p>
                <button className="btn-primary mt-15" style={{width:'auto',padding:'10px 24px'}} onClick={fetchOrders}>আবার চেষ্টা</button>
              </>):(<>
                <div style={{fontSize:36,marginBottom:10}}>⚠️</div>
                <p style={{fontSize:12}}>{adminErr}</p>
                <button className="btn-primary mt-15" style={{width:'auto',padding:'10px 24px'}} onClick={fetchOrders}>আবার চেষ্টা</button>
              </>)}
            </div>
          ):allOrders.length===0&&!adminLoading?(
            <div style={{textAlign:'center',padding:'40px 20px',color:'var(--muted)'}}>
              <p style={{marginBottom:16}}>কোনো অর্ডার নেই।</p>
              <button className="btn-primary" style={{width:'auto',padding:'10px 24px'}} onClick={fetchOrders}>লোড করুন</button>
            </div>
          ):(
            <div className="orders-list">
              {allOrders.filter(o=>adminFilter==='All'||o.status===adminFilter).map(order=>(
                <div key={order.id} className={`admin-order-card ${stCls(order.status)}`}>
                  <div className="o-header"><strong>#{String(order.id).slice(-6).toUpperCase()}</strong><span className="o-date">{order.date}</span></div>
                  <p><b>নাম:</b> {order.userInfo?.name} | <b>মোবাইল:</b> {order.userInfo?.phone}</p>
                  <p><b>ঠিকানা:</b> {order.userInfo?.finalLocation}, {order.userInfo?.address}, {order.userInfo?.area}, {order.userInfo?.district}</p>
                  <p className="o-items-text"><b>পণ্য:</b> {Array.isArray(order.items)&&order.items.map(i=>`${i.name}(${i.qty}${parseUnit(i.unit).text})`).join(', ')}</p>
                  <p><b>পেমেন্ট:</b> <span className="highlight-text">{order.paymentMethod}</span> | <b>মোট:</b> ৳{order.total}</p>
                  {(order.paymentMethod==='Bkash'||order.paymentMethod==='Nogod')&&<p className="trx-box">TrxID: {order.userInfo?.transactionId} | Sender: {order.userInfo?.senderNumber}</p>}
                  <div className="status-updater">
                    <label>স্টেটাস:</label>
                    <select className={`status-select ${stCls(order.status)}`} value={order.status}
                      onChange={async e=>{try{await updateDoc(doc(db,'orders',order.id),{status:e.target.value});fetchOrders();}catch(err){showToast('আপডেট সমস্যা','error');}}}>
                      <option value="Pending">Pending ⏳</option>
                      <option value="Confirmed">Confirmed ✅</option>
                      <option value="On Delivery">On Delivery 🚚</option>
                      <option value="Delivered">Delivered 🏁</option>
                      <option value="Cancelled">Cancelled ❌</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>)}
      </div>
    </div>
  );

  // ══════ CUSTOMER VIEW ══════
  const coverStyle=info.coverPhoto
    ?{backgroundImage:`url(${info.coverPhoto})`,backgroundSize:'cover',backgroundPosition:'center'}
    :{background:info.coverGradient||'linear-gradient(135deg,#1a7a43,#27ae60)'};

  return(
    <div className="app-container">
      {toast&&<div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      {/* Logout Confirm */}
      {showLogoutConfirm&&(
        <div className="modal-bg" onClick={()=>setShowLogoutConfirm(false)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <h3 className="text-green mb-10">🚪 লগ আউট করবেন?</h3>
            <p style={{lineHeight:1.6,marginBottom:16}}>লগ আউট করলে আপনার সকল তথ্য ও অর্ডারের ডেটা {user?.isAnon?'মুছে যাবে (গেস্ট অ্যাকাউন্ট সংরক্ষণ হয় না)।':'লগইন করলে আবার দেখতে পাবেন।'}</p>
            <div style={{display:'flex',gap:10}}>
              <button className="btn-danger flex-1" onClick={doLogout}>হ্যাঁ, লগ আউট</button>
              <button className="btn-outline flex-1" onClick={()=>setShowLogoutConfirm(false)}>বাতিল</button>
            </div>
          </div>
        </div>
      )}

      {/* Emoji Picker */}
      {showEmojiPicker&&(
        <div className="modal-bg" onClick={()=>setShowEmojiPicker(false)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <h3 className="text-green mb-10">প্রোফাইল ইমোজি বেছে নিন</h3>
            <div className="emoji-grid">
              {EMOJIS.map(em=>(
                <button key={em} className={`emoji-btn ${info.profileEmoji===em?'active':''}`}
                  onClick={()=>{const upd={...info,profileEmoji:em};setInfo(upd);saveProfile(upd);setShowEmojiPicker(false);}}>
                  {em}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Cover Picker */}
      {showCoverPicker&&(
        <div className="modal-bg" onClick={()=>setShowCoverPicker(false)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <h3 className="text-green mb-10">কভার বেছে নিন</h3>
            <p style={{fontSize:12,color:'var(--muted)',marginBottom:12}}>ডিফল্ট ডিজাইন:</p>
            <div className="cover-picker-grid">
              {DEFAULT_COVERS.map((g,i)=>(
                <div key={i} className={`cover-pick-item ${!info.coverPhoto&&info.coverGradient===g?'active':''}`}
                  onClick={()=>{const upd={...info,coverPhoto:'',coverGradient:g};setInfo(upd);saveProfile(upd);setShowCoverPicker(false);}}>
                  <div style={{width:'100%',height:60,background:g,borderRadius:6}}/>
                  {!info.coverPhoto&&info.coverGradient===g&&<div className="cover-check">✓</div>}
                </div>
              ))}
            </div>
            {coverPhotos.length>0&&(<>
              <p style={{fontSize:12,color:'var(--muted)',margin:'12px 0 8px'}}>কাস্টম ছবি:</p>
              <div className="cover-picker-grid">
                {coverPhotos.map((url,i)=>(
                  <div key={i} className={`cover-pick-item ${info.coverPhoto===url?'active':''}`}
                    onClick={()=>{const upd={...info,coverPhoto:url};setInfo(upd);saveProfile(upd);setShowCoverPicker(false);}}>
                    <img src={url} alt="" onError={e=>{e.target.src='https://placehold.co/120x60/e8f5e9/27ae60?text=err';}}/>
                    {info.coverPhoto===url&&<div className="cover-check">✓</div>}
                  </div>
                ))}
              </div>
            </>)}
            <button className="btn-outline mt-15" onClick={()=>setShowCoverPicker(false)}>বন্ধ করুন</button>
          </div>
        </div>
      )}

      {/* Notification Modal */}
      {showNotifModal&&(
        <div className="modal-bg" onClick={()=>setShowNotifModal(false)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <h3 className="text-green mb-10">🔔 নোটিফিকেশন</h3>
            {notif.show&&notif.text?<p style={{lineHeight:1.6}}>{notif.text}</p>:<p className="text-muted">এই মুহূর্তে কোনো নোটিফিকেশন নেই।</p>}
            <button className="btn-primary mt-20" onClick={()=>setShowNotifModal(false)}>ঠিক আছে</button>
          </div>
        </div>
      )}

      {/* Drawer */}
      <div className={`drawer-overlay ${drawer?'active':''}`} onClick={()=>setDrawer(false)}/>
      <div className={`side-drawer ${drawer?'open':''}`}>
        <div className="drawer-head"><span>🌿 সাকিব স্টোর</span><button className="drawer-close" onClick={()=>setDrawer(false)}>✕</button></div>
        <ul className="drawer-menu">
          <li onClick={()=>{goto('home');setDrawer(false);}}>🏠 হোম</li>
          <li onClick={()=>{goto('profile');setDrawer(false);}}>👤 প্রোফাইল</li>
          <li onClick={()=>{window.open('https://eduvibebd.blogspot.com/2026/03/sakibstore.html','_blank');setDrawer(false);}}>🚀 App Update</li>
          <li onClick={()=>{goto('about');setDrawer(false);}}>ℹ️ About Us</li>
          <li className="admin-menu-link" onClick={()=>{setMode('adminLogin');setDrawer(false);}}>🛡️ অ্যাডমিন প্যানেল</li>
        </ul>
      </div>

      {/* FIX: Header — home-এ শুধু ☰ এবং 🔔, "সাকিব স্টোর" লেখা নেই */}
      {isHome?(
        <header className="main-header">
          <img src={headerImg} alt="header" className="header-bg-img" onError={e=>{e.target.style.display='none';}}/>
          <div className="header-overlay">
            <button className="icon-btn" onClick={()=>setDrawer(true)}>☰</button>
            {/* FIX: No "সাকিব স্টোর" text on home header */}
            <div/>
            <button className="icon-btn notif-btn" onClick={()=>setShowNotifModal(true)}>
              🔔{notif.show&&<span className="notif-dot"/>}
            </button>
          </div>
        </header>
      ):(
        <header className="mini-header">
          <button className="icon-btn-dark" onClick={()=>setDrawer(true)}>☰</button>
          <div className="mini-header-title">সাকিব স্টোর</div>
          <button className="icon-btn-dark notif-btn" onClick={()=>setShowNotifModal(true)}>
            🔔{notif.show&&<span className="notif-dot-dark"/>}
          </button>
        </header>
      )}

      <div className="marquee-wrapper"><div className="marquee-track"><span>📢 {notice}&nbsp;&nbsp;&nbsp;&nbsp;📢 {notice}</span></div></div>

      <main className="main-content">

        {/* HOME */}
        {tab==='home'&&(
          <div className="page-home">
            <div className="search-wrapper">
              <input type="text" placeholder="যে কোন কিছু সার্চ করুন..." value={search} onChange={e=>setSearch(e.target.value)}/>
              <span className="search-icon">🔍</span>
              {search&&<button className="search-clear" onClick={()=>setSearch('')}>✕</button>}
            </div>
            <div className="horizontal-categories">
              {CATS.map(c=><button key={c} className={`cat-pill ${homeCat===c?'active':''}`} onClick={()=>{setHomeCat(c);setSearch('');}}>{c}</button>)}
            </div>
            {filtered.length===0?(
              <div className="empty-state text-center mt-30"><div className="empty-icon">🔍</div><p>{search?`"${search}" পাওয়া যায়নি`:'এই ক্যাটাগরিতে পণ্য নেই'}</p>
                <button className="btn-primary mt-10" style={{width:'auto',padding:'8px 20px'}} onClick={()=>{setHomeCat('সব পণ্য');setSearch('');}}>সব পণ্য দেখুন</button>
              </div>
            ):(
              <div className="product-grid-3">{filtered.map(p=><PCard key={p.id} p={p}/>)}</div>
            )}
          </div>
        )}

        {/* CATEGORIES */}
        {tab==='categories'&&(
          <div className="page-categories">
            <div className="cat-sidebar">{CATS.map(c=><div key={c} className={`cat-side-item ${catSel===c?'active':''}`} onClick={()=>setCatSel(c)}>{c}</div>)}</div>
            <div className="cat-content">
              <h3 className="cat-title">{catSel}</h3>
              <div className="product-grid-2">{products.filter(p=>catSel==='সব পণ্য'||p.category===catSel).map(p=><PCard key={p.id} p={p}/>)}</div>
            </div>
          </div>
        )}

        {/* CART */}
        {tab==='cart'&&(
          <div className="page-cart">
            <h2 className="section-title text-center">আপনার কার্ট 🛒</h2>
            {cart.length===0?(
              <div className="empty-state text-center mt-30"><div className="empty-icon">🛒</div><p>কার্ট খালি!</p><button className="btn-primary mt-10" onClick={()=>goto('home')}>পণ্য বাছাই করুন</button></div>
            ):(
              <div className="cart-checkout-wrapper">
                <div className="cart-items-list">
                  {cart.map(item=>(
                    <div key={item.id} className="cart-item">
                      <img src={item.image||'https://placehold.co/50x50/e8f5e9/27ae60?text=P'} alt={item.name} className="cart-item-img"/>
                      <div className="c-info"><strong>{item.name}</strong><p className="text-muted">{bn(item.qty)}{parseUnit(item.unit).text}</p></div>
                      <div className="c-right">
                        <div className="c-price">৳{bn((item.price/parseUnit(item.unit).baseQty)*item.qty)}</div>
                        <div className="qty-controls small">
                          <button className="btn-minus" onClick={()=>cartAction(item,'remove')}>-</button>
                          <span className="qty-text">{bn(item.qty)}</span>
                          <button className="btn-plus" onClick={()=>cartAction(item,'add')}>+</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="checkout-form mt-20">
                  <h3 className="sub-title">📍 কোথায় ডেলিভারি নিবেন?</h3>
                  <div className="selector-grid">
                    {DLOCS.map(loc=><button key={loc} className={`select-box ${info.locationType===loc?'active':''}`} onClick={()=>setInfo({...info,locationType:loc})}>{loc}{loc!=='নিজে লেখুন'&&<span className="charge-hint">৳{getDC(loc)}</span>}</button>)}
                  </div>
                  {info.locationType==='নিজে লেখুন'&&<input type="text" className="custom-input mt-10" placeholder="জায়গার নাম লিখুন..." value={customLoc} onChange={e=>setCustomLoc(e.target.value)}/>}
                  <h3 className="sub-title mt-20">🚚 ডেলিভারি তথ্য</h3>
                  <div className="form-group">
                    <input type="text" placeholder="আপনার নাম *" value={info.name} onChange={e=>setInfo({...info,name:e.target.value})}/>
                    <input type="number" placeholder="মোবাইল নম্বর *" value={info.phone} onChange={e=>setInfo({...info,phone:e.target.value})}/>
                    <div style={{display:'flex',gap:10}}>
                      <input type="text" placeholder="জেলা *" value={info.district} onChange={e=>setInfo({...info,district:e.target.value})}/>
                      <input type="text" placeholder="থানা/উপজেলা *" value={info.area} onChange={e=>setInfo({...info,area:e.target.value})}/>
                    </div>
                    <textarea placeholder="গ্রাম/রোড/বাড়ি নং *" value={info.address} onChange={e=>setInfo({...info,address:e.target.value})}/>
                  </div>
                  <h3 className="sub-title mt-20">💳 পেমেন্ট পদ্ধতি</h3>
                  <div className="selector-grid cols-3">
                    {['Bkash','Nogod','Cash on Delivery'].map(pm=><button key={pm} className={`select-box payment-box ${info.paymentMethod===pm?'active':''}`} onClick={()=>setInfo({...info,paymentMethod:pm})}>{pm==='Bkash'?'💗 Bkash':pm==='Nogod'?'🔴 Nogod':'💵 CoD'}</button>)}
                  </div>
                  {(info.paymentMethod==='Bkash'||info.paymentMethod==='Nogod')&&(
                    <div className="payment-instructions mt-10">
                      <p className="pay-number">📲 Personal: <strong>01723539738</strong></p>
                      <p className="text-muted text-sm mb-10">উপরের নম্বরে Send Money করুন:</p>
                      <input type="number" placeholder="যে নম্বর থেকে পাঠিয়েছেন *" value={info.senderNumber} onChange={e=>setInfo({...info,senderNumber:e.target.value})} className="mb-10"/>
                      <input type="text" placeholder="Transaction ID *" value={info.transactionId} onChange={e=>setInfo({...info,transactionId:e.target.value})}/>
                    </div>
                  )}
                  <div className="bill-summary mt-20">
                    <div className="bill-row"><span>পণ্যের দাম:</span><span>৳{bn(cartTotal)}</span></div>
                    <div className="bill-row"><span>ডেলিভারি:</span><span>৳{bn(dCharge)}</span></div>
                    <div className="bill-row total"><span>মোট বিল:</span><span>৳{bn(finalTotal)}</span></div>
                  </div>
                  <button className="btn-confirm-order mt-20" onClick={submitOrder}>✅ অর্ডার নিশ্চিত করুন (৳{bn(finalTotal)})</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PROFILE */}
        {tab==='profile'&&(
          <div className="page-profile">
            {!user?(
              <div className="auth-screen text-center">
                <div className="auth-logo">🛒</div>
                <h2 className="mb-10">লগইন করুন</h2>

                {authMode==='choice'&&(<>
                  <p className="text-muted mb-20">অর্ডার ট্র্যাক ও তথ্য সেভ করতে লগইন করুন।</p>
                  <button className="btn-google mb-10" onClick={googleLogin} disabled={authLoading}>
                    <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="G" width="20"/>
                    {authLoading?'লোড হচ্ছে...':'Google দিয়ে লগইন'}
                  </button>
                  <button className="btn-email mb-10" onClick={()=>setAuthMode('email-login')}>
                    📧 ইমেইল দিয়ে লগইন
                  </button>
                  <button className="btn-email-reg mb-10" onClick={()=>setAuthMode('email-register')}>
                    ✏️ নতুন অ্যাকাউন্ট তৈরি করুন
                  </button>
                  <div className="divider">অথবা</div>
                  <button className="btn-outline mt-10" onClick={guestLogin}>👤 গেস্ট হিসেবে প্রবেশ করুন</button>
                  <p className="text-muted mt-15 text-sm">Google/Email লগইন করলে ডেটা চিরস্থায়ী থাকে।</p>
                </>)}

                {authMode==='email-login'&&(
                  <div style={{width:'100%',maxWidth:300}}>
                    <p className="text-muted mb-15">ইমেইল ও পাসওয়ার্ড দিয়ে লগইন করুন</p>
                    <input type="email" placeholder="ইমেইল" value={emailInput} onChange={e=>setEmailInput(e.target.value)} className="auth-input mb-10"/>
                    <input type="password" placeholder="পাসওয়ার্ড" value={passInput} onChange={e=>setPassInput(e.target.value)} className="auth-input mb-15"
                      onKeyDown={e=>{if(e.key==='Enter')emailLogin();}}/>
                    <button className="btn-primary mb-10" onClick={emailLogin} disabled={authLoading}>{authLoading?'লোড...':'লগইন করুন'}</button>
                    <button className="btn-outline" onClick={()=>{setAuthMode('choice');setEmailInput('');setPassInput('');}}>← ফিরে যান</button>
                  </div>
                )}

                {authMode==='email-register'&&(
                  <div style={{width:'100%',maxWidth:300}}>
                    <p className="text-muted mb-15">নতুন অ্যাকাউন্ট তৈরি করুন</p>
                    <input type="text" placeholder="আপনার নাম" value={nameInput} onChange={e=>setNameInput(e.target.value)} className="auth-input mb-10"/>
                    <input type="email" placeholder="ইমেইল" value={emailInput} onChange={e=>setEmailInput(e.target.value)} className="auth-input mb-10"/>
                    <input type="password" placeholder="পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)" value={passInput} onChange={e=>setPassInput(e.target.value)} className="auth-input mb-15"/>
                    <button className="btn-primary mb-10" onClick={emailRegister} disabled={authLoading}>{authLoading?'তৈরি হচ্ছে...':'অ্যাকাউন্ট তৈরি করুন'}</button>
                    <button className="btn-outline" onClick={()=>{setAuthMode('choice');setEmailInput('');setPassInput('');setNameInput('');}}>← ফিরে যান</button>
                  </div>
                )}
              </div>
            ):(
              <div className="profile-dashboard">
                <div className="profile-header-box">
                  <div className="cover-photo" style={coverStyle}>
                    <button className="cover-change-btn" onClick={()=>setShowCoverPicker(true)}>🖼️ কভার পরিবর্তন</button>
                  </div>
                  <div className="avatar-section">
                    <div className="avatar-emoji" onClick={()=>setShowEmojiPicker(true)}>
                      <span className="avatar-emoji-icon">{info.profileEmoji||'👤'}</span>
                      <div className="avatar-edit-hint">✏️</div>
                    </div>
                    <div className="user-titles">
                      <h3>{info.name||(user.isAnon?'গেস্ট ইউজার':user.name||'নাম দিন')}</h3>
                      <p>{user.email||(user.isAnon?'Guest Account':'')}</p>
                    </div>
                  </div>
                </div>
                <div className="profile-edit-card mt-20">
                  <h3 className="sub-title">✏️ আপনার তথ্য</h3>
                  <div className="form-group">
                    <input type="text" placeholder="আপনার নাম" value={info.name} onChange={e=>setInfo({...info,name:e.target.value})}/>
                    <input type="number" placeholder="মোবাইল নম্বর" value={info.phone} onChange={e=>setInfo({...info,phone:e.target.value})}/>
                    <div style={{display:'flex',gap:10}}>
                      <input type="text" placeholder="জেলা" value={info.district} onChange={e=>setInfo({...info,district:e.target.value})}/>
                      <input type="text" placeholder="থানা/উপজেলা" value={info.area} onChange={e=>setInfo({...info,area:e.target.value})}/>
                    </div>
                    <textarea placeholder="গ্রাম/রোড/বাড়ি নং" value={info.address} onChange={e=>setInfo({...info,address:e.target.value})}/>
                    <button className="btn-primary mt-10" onClick={()=>saveProfile()}>💾 তথ্য সেভ করুন</button>
                  </div>
                </div>
                <div className="order-history mt-20">
                  <h3 className="sub-title">📦 আপনার অর্ডার ({userOrders.length})</h3>
                  {userOrders.length===0?<p className="text-muted">কোনো অর্ডার নেই।</p>:(
                    userOrders.map(o=>(
                      <div key={o.id} className={`history-card ${stCls(o.status)}`}>
                        <div className="hc-head"><strong>Order #{String(o.id).slice(-6).toUpperCase()}</strong><span className={`badge-status ${stCls(o.status)}`}>{o.status}</span></div>
                        <p className="text-sm text-muted">{o.date}</p>
                        <p className="mt-5"><b>পণ্য:</b> {Array.isArray(o.items)&&o.items.map(i=>`${i.name}(${i.qty})`).join(', ')}</p>
                        <p><b>মোট:</b> ৳{bn(o.total)}</p>
                      </div>
                    ))
                  )}
                </div>
                {/* FIX: Logout confirmation */}
                <button className="btn-danger w-full mt-20" onClick={confirmLogout}>🚪 লগ আউট করুন</button>
              </div>
            )}
          </div>
        )}

        {/* ABOUT */}
        {tab==='about'&&(
          <div className="about-view">
            <h2 className="text-green mb-20">About Us</h2>
            <div className="about-logo">🌿</div>
            <h3 className="mb-10">সাকিব স্টোর</h3>
            <p className="about-desc">সাকিব স্টোর একটি বিশ্বস্ত অনলাইন গ্রোসারি শপ। সাশ্রয়ী মূল্যে ফ্রেশ পণ্য আপনাদের দুয়ারে পৌঁছে দেই।</p>
            <div className="contact-box mt-30">
              <p className="contact-title">📞 যোগাযোগ:</p>
              <p>০১৭২৪৪০৯২১৯</p><p>০১৭৩৫৩৭৬০৭৯</p><p>০১৭২৩৫৩৯৭৩৮</p>
            </div>
          </div>
        )}
      </main>

      <footer className="bottom-nav">
        <div className={`nav-icon ${tab==='home'?'active':''}`} onClick={()=>goto('home')}><span>🏠</span><span>হোম</span></div>
        <div className={`nav-icon ${tab==='categories'?'active':''}`} onClick={()=>goto('categories')}><span>🗂️</span><span>ক্যাটাগরি</span></div>
        <div className={`nav-icon cart-nav ${tab==='cart'?'active':''}`} onClick={()=>goto('cart')}>
          <span>🛒</span><span>কার্ট</span>
          {cart.length>0&&<span className="nav-badge">{bn(cart.length)}</span>}
        </div>
        <div className={`nav-icon ${tab==='profile'?'active':''}`} onClick={()=>goto('profile')}><span>👤</span><span>প্রোফাইল</span></div>
      </footer>
    </div>
  );
}

export default function App(){return<ErrorBoundary><AppInner/></ErrorBoundary>;}
