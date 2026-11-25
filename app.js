(() => {
'use strict';
const API = 'https://fouryoo.onrender.com/api';
const $ = id => document.getElementById(id);
const state = {shops:[],token:localStorage.getItem('4yoo_token')||'', user:null, products:[], cart:[], addresses:[], address:null, category:'all', wishlist:[], authMode:'login'};
const money = n => '₹'+Number(n||0).toFixed(2);
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const imageUrl = value => !value ? '' : (/^https?:\/\//i.test(value) ? value : API.replace(/\/api\/?$/,'')+(String(value).startsWith('/')?'':'/')+value);
function toast(message){const el=$('toast');el.textContent=message;el.style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.style.display='none',3200)}
function setMessage(id,message){if($(id))$(id).textContent=message||''}
function headers(){return state.token?{Authorization:'Bearer '+state.token}:{}}
async function api(path, options={}){
 const opts={...options,headers:{...headers(),...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}};
 let response;
 try{response=await fetch(API+path,opts)}catch(e){throw Error('Unable to connect to 4YOO. Check your internet and try again.')}
 const raw=await response.text();let data={};
 try{data=raw?JSON.parse(raw):{}}catch{data={detail:raw||'Unexpected server response'}}
 if(!response.ok)throw Error(data.detail||data.message||`Request failed (${response.status})`);
 return data;
}
function openDialog(id){const d=$(id);if(d&&!d.open)d.showModal()}
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d)d.close()}));
function requireLogin(){if(!state.token){openDialog('loginDialog');return false}return true}
function setAuthMode(mode){
 state.authMode=mode;
 document.querySelectorAll('[data-auth]').forEach(b=>b.classList.toggle('active',b.dataset.auth===mode));
 $('emailLoginFields').hidden=mode!=='login';$('registerFields').hidden=mode!=='register';$('otpFields').hidden=mode!=='login';
 $('loginMessage').textContent='';
}
document.querySelectorAll('[data-auth]').forEach(b=>b.onclick=()=>setAuthMode(b.dataset.auth));
function loginSuccess(data){
 if(!data.access_token)throw Error('Login response did not include an access token.');
 state.token=data.access_token;state.user=data.user||null;localStorage.setItem('4yoo_token',state.token);
 $('loginDialog').close();$('loginOpen').textContent='Logout';toast('Welcome to 4YOO');
 initActiveRole();
}

let activePortalRole = '';
const ALL_4YOO_ROLES = ['customer','shop_owner','delivery_partner'];
function roleList(){ return ALL_4YOO_ROLES; }

function showRolePortal(role){
 activePortalRole=role;
 const customer=role==='customer';
 $('rolePortal').hidden=customer;
 document.querySelector('main').hidden=!customer;
 document.querySelector('.footer').hidden=!customer;
 if(customer){initCustomer();return}
 $('roleTitle').textContent=role==='shop_owner'?'Shop Owner Dashboard':'Delivery Partner Dashboard';
 $('roleSubtitle').textContent=role==='shop_owner'?'Manage orders, products, inventory and offers.':'Go online, accept nearby pickups and complete deliveries.';
 $('roleNotice').textContent='';
 $('ownerProducts').hidden=role!=='shop_owner';
 if(role==='shop_owner')initOwnerProductManagement();
 loadRoleOrders();
 loadRoleNotifications();
 loadRoleFinance();
 if(roleNotificationTimer)clearInterval(roleNotificationTimer);
 roleNotificationTimer=setInterval(()=>{if(state.token&&activePortalRole!=='customer')loadRoleNotifications()},30000);
}
async function initActiveRole(){
 const roles=roleList();
 const current=String(state.user?.role||'customer').toLowerCase();
 const sel=$('activeRole');
 sel.innerHTML=roles.map(r=>`<option value="${esc(r)}">${r==='shop_owner'?'Shop Owner':r==='delivery_partner'?'Delivery Partner':'Customer'}</option>`).join('');
 const loginButton=$('loginOpen');
 if(loginButton?.parentElement && sel.parentElement!==loginButton.parentElement){
   loginButton.parentElement.insertBefore(sel,loginButton);
 }
 sel.classList.add('header-role-switch');
 sel.hidden=false;
 sel.value=roles.includes(current)?current:'customer';

 sel.onchange=async()=>{
  const target=sel.value;
  if(target===String(state.user?.role||'customer').toLowerCase()){
   showRolePortal(target);
   return;
  }
  sel.disabled=true;
  try{
   const data=await api('/auth/switch-role',{
    method:'POST',
    body:JSON.stringify({role:target})
   });
   if(!data.access_token)throw Error('Role switch response did not include an access token.');
   state.token=data.access_token;
   localStorage.setItem('4yoo_token',state.token);
   state.user=data.user||state.user;
   if(!state.user.role)state.user.role=target;
   if(!Array.isArray(state.user.roles))state.user.roles=roles;
   sel.value=target;
   showRolePortal(target);
   toast('Switched to '+(target==='shop_owner'?'Shop Owner':target==='delivery_partner'?'Delivery Partner':'Customer'));
  }catch(e){
   sel.value=String(state.user?.role||'customer').toLowerCase();
   toast(e.message||'Role switch failed');
  }finally{
   sel.disabled=false;
  }
 };
 $('roleRefresh').onclick=loadRoleOrders;
 $('roleRefreshNotifications').onclick=loadRoleNotifications;
 $('roleReadAll').onclick=markAllRoleNotificationsRead;
 $('roleHome').onclick=()=>{
  sel.value='customer';
  sel.dispatchEvent(new Event('change'));
 };
 showRolePortal(sel.value);
}
async function roleAction(path,method='POST',body){
 return api(path,{method,body:body?JSON.stringify(body):undefined});
}
function roleCard(title,subtitle,body,buttons=''){
 return `<article class="role-order"><h3>${esc(title)}</h3><span class="status-pill">${esc(subtitle)}</span>${body}<div class="order-buttons">${buttons}</div></article>`;
}


function financePanel(){
 const old=$('roleFinance');
 if(old)return old;
 const box=document.createElement('section');
 box.id='roleFinance';
 box.style.cssText='margin:16px 0;padding:16px;border:1px solid #e5e7eb;border-radius:14px;background:#fff';
 const orders=$('roleOrders');
 if(orders)orders.insertAdjacentElement('beforebegin',box);
 return box;
}
async function loadRoleFinance(){
 if(!state.token||activePortalRole==='customer')return;
 const box=financePanel();
 if(!box)return;
 box.innerHTML='<p>Loading earnings…</p>';
 try{
  if(activePortalRole==='shop_owner'){
   const [e,status]=await Promise.all([
    api('/shop-owner/earnings'),
    api('/shop-owner/shop-status')
   ]);
   box.innerHTML=`<h3>Shop Overview</h3>
    <p><b>Total Earnings:</b> ${money(e.total_earnings)}</p>
    <p><b>Pending Settlement:</b> ${money(e.pending_settlement)}</p>
    <p><b>Settled:</b> ${money(e.settled_amount)}</p>
    <p><b>Total Orders:</b> ${Number(e.total_orders||0)}</p>
    <p>Shop status: <b>${status.is_open?'Open':'Closed'}</b></p>
    <button class="btn btn-primary" id="shopStatusToggle">${status.is_open?'Close Shop':'Open Shop'}</button>
    <h4>Recent Earnings</h4>
    ${(e.earnings||[]).slice(0,10).map(x=>`<p>Order #${Number(x.sale_id)} · ${money(x.shop_owner_earning)} · ${String(x.status||'').replaceAll('_',' ')}</p>`).join('')||'<p>No earnings yet.</p>'}`;
   $('shopStatusToggle').onclick=async()=>{
    try{
     await api('/shop-owner/shop-status',{method:'PATCH',body:JSON.stringify({is_open:!status.is_open})});
     toast('Shop status updated');
     loadRoleFinance();
    }catch(err){toast(err.message)}
   };
  }else{
   const e=await api('/delivery/earnings');
   box.innerHTML=`<h3>Delivery Earnings</h3>
    <p><b>Total Earnings:</b> ${money(e.total_earnings)}</p>
    <p><b>Pending Settlement:</b> ${money(e.pending_settlement)}</p>
    <p><b>Settled:</b> ${money(e.settled_amount)}</p>
    <p><b>Total Deliveries:</b> ${Number(e.total_deliveries||0)}</p>
    <h4>Recent Deliveries</h4>
    ${(e.earnings||[]).slice(0,10).map(x=>`<p>${esc(x.invoice_number||('#'+x.sale_id))} · ${money(x.partner_earning)} · ${esc(x.status||'')}</p>`).join('')||'<p>No earnings yet.</p>'}`;
  }
 }catch(err){
  box.innerHTML=`<p>Dashboard information unavailable: ${esc(err.message)}</p><button class="btn btn-light" id="financeRetry">Retry</button>`;
  $('financeRetry').onclick=loadRoleFinance;
 }
}

let roleNotificationTimer=null;
async function loadRoleNotifications(){
 const box=$('roleNotifications');
 if(!box||!state.token)return;
 try{
  const result=await api('/notifications');
  const rows=Array.isArray(result.data)?result.data:[];
  $('roleUnreadCount').textContent=String(Number(result.unread_count)||0);
  box.innerHTML=rows.length?rows.slice(0,15).map(n=>`<article class="role-notification ${n.is_read?'read':'unread'}"><div><b>${esc(n.title||'4YOO Notification')}</b><p>${esc(n.message||'')}</p><small>${esc(n.created_at||'')}</small></div>${n.is_read?'':'<button class="btn btn-light" data-notification-read="'+Number(n.id)+'">Mark read</button>'}</article>`).join(''):'<p class="muted">No notifications yet.</p>';
  box.querySelectorAll('[data-notification-read]').forEach(b=>b.onclick=async()=>{
   try{await api('/notifications/'+Number(b.dataset.notificationRead)+'/read',{method:'PUT'});await loadRoleNotifications()}catch(e){toast(e.message)}
  });
 }catch(e){box.innerHTML=`<p class="muted">Notifications unavailable: ${esc(e.message)}</p>`}
}
async function markAllRoleNotificationsRead(){
 try{await api('/notifications/read-all',{method:'PUT'});await loadRoleNotifications();toast('Notifications marked as read')}catch(e){toast(e.message)}
}


async function uploadOwnerProductImage(file){
 if(!file)return null;
 const fd=new FormData();fd.append('file',file);
 const response=await fetch(API+'/uploads/product-image',{method:'POST',headers:headers(),body:fd});
 const raw=await response.text();let data={};
 try{data=raw?JSON.parse(raw):{}}catch{data={detail:raw}}
 if(!response.ok)throw Error(data.detail||'Product image upload failed');
 if(!data.image_url)throw Error('Image upload did not return an image URL');
 return data.image_url;
}
async function loadOwnerProducts(){
 const grid=$('ownerProductsGrid'),notice=$('ownerProductsNotice');
 if(!grid||activePortalRole!=='shop_owner')return;
 notice.textContent='Loading your products…';
 try{
  const rows=await api('/products');
  notice.textContent=rows.length?`${rows.length} product(s) in your inventory.`:'No products yet. Use Add Product to create your first listing.';
  grid.innerHTML=rows.map(p=>`<article class="owner-product-card">
   <div class="owner-product-photo">${p.image_url?`<img src="${esc(imageUrl(p.image_url))}" alt="${esc(p.name)}" loading="lazy" onerror="this.style.display='none'">`:'<span>📦</span>'}</div>
   <div class="owner-product-info"><span class="status-pill">${esc(p.category||'General')}</span><h3>${esc(p.name)}</h3>
   <p>${esc(p.description||'')}</p><b>${money(p.selling_price)}</b> <small>Cost: ${money(p.cost_price)}</small>
   <p>Stock: <b>${Number(p.stock_quantity)||0}</b> · Discount: ${Number(p.discount_percent)||0}%</p>
   ${p.offer_active?`<p class="owner-active-offer">Offer: ${esc(p.offer_title||'Active')}</p>`:''}
   <div class="owner-product-actions"><button class="btn btn-light" data-product-edit="${Number(p.id)}">Edit</button><button class="btn btn-light" data-product-stock="${Number(p.id)}">Update Stock</button><button class="btn btn-light" data-product-delete="${Number(p.id)}">Delete</button></div></div>
  </article>`).join('');
  grid.querySelectorAll('[data-product-edit]').forEach(b=>b.onclick=()=>editOwnerProduct(Number(b.dataset.productEdit)));
  grid.querySelectorAll('[data-product-stock]').forEach(b=>b.onclick=()=>updateOwnerStock(Number(b.dataset.productStock)));
  grid.querySelectorAll('[data-product-delete]').forEach(b=>b.onclick=()=>deleteOwnerProduct(Number(b.dataset.productDelete)));
 }catch(e){notice.textContent=e.message;grid.innerHTML=''}
}
async function editOwnerProduct(id){
 try{
  const p=await api('/products/'+id),f=$('ownerProductForm');
  f.reset();f.hidden=false;
  f.elements.product_id.value=p.id;
  for(const key of ['name','category','sku','selling_price','cost_price','stock_quantity','discount_percent','description','offer_title','offer_description']){
   if(f.elements[key])f.elements[key].value=p[key]??(key==='discount_percent'?0:'');
  }
  f.elements.offer_active.checked=!!p.offer_active;
  $('ownerProductFormTitle').textContent='Edit Product';
  $('saveOwnerProduct').textContent='Update Product';
  f.scrollIntoView({behavior:'smooth',block:'start'});
 }catch(e){toast(e.message)}
}
async function updateOwnerStock(id){
 const change=prompt('Enter stock change. Use positive number to add, negative to reduce:');
 if(change===null)return;
 if(!/^-?\d+$/.test(change)||Number(change)===0){toast('Enter a non-zero whole number');return}
 try{
  await api(`/products/${id}/stock?quantity=${encodeURIComponent(change)}`,{method:'PATCH'});
  toast('Stock updated');await loadOwnerProducts();
 }catch(e){toast(e.message)}
}
async function deleteOwnerProduct(id){
 if(!confirm('Delete this product? This action cannot be undone.'))return;
 try{await api('/products/'+id,{method:'DELETE'});toast('Product deleted');await loadOwnerProducts()}
 catch(e){toast(e.message)}
}
function initOwnerProductManagement(){
 const section=$('ownerProducts');
 if(!section)return;
 section.hidden=false;
 $('showProductForm').onclick=()=>{
  const f=$('ownerProductForm');f.reset();f.elements.product_id.value='';
  $('ownerProductFormTitle').textContent='Add New Product';
  $('saveOwnerProduct').textContent='Save Product';
  $('ownerProductMessage').textContent='';
  f.hidden=false;f.scrollIntoView({behavior:'smooth',block:'start'});
 };
 $('cancelProductForm').onclick=()=>{$('ownerProductForm').hidden=true};
 $('ownerProductForm').onsubmit=async e=>{
  e.preventDefault();
  const f=e.currentTarget,fd=new FormData(f),id=String(fd.get('product_id')||'');
  const btn=$('saveOwnerProduct');btn.disabled=true;
  $('ownerProductMessage').textContent='Saving product…';
  try{
   let image_url=null;
   const file=f.elements.product_image.files[0];
   if(file)image_url=await uploadOwnerProductImage(file);
   const payload={
    name:String(fd.get('name')).trim(),
    category:String(fd.get('category')).trim(),
    sku:String(fd.get('sku')||'').trim()||null,
    description:String(fd.get('description')||'').trim()||null,
    selling_price:Number(fd.get('selling_price')),
    cost_price:Number(fd.get('cost_price')),
    stock_quantity:Number(fd.get('stock_quantity')),
    discount_percent:Number(fd.get('discount_percent')||0),
    offer_title:String(fd.get('offer_title')||'').trim()||null,
    offer_description:String(fd.get('offer_description')||'').trim()||null,
    offer_active:f.elements.offer_active.checked
   };
   if(image_url)payload.image_url=image_url;
   if(id){
    const existing=await api('/products/'+id);
    if(!image_url)payload.image_url=existing.image_url||null;
    await api('/products/'+id,{method:'PUT',body:JSON.stringify(payload)});
   }else{
    if(!image_url)payload.image_url=null;
    await api('/products',{method:'POST',body:JSON.stringify(payload)});
   }
   f.hidden=true;f.reset();toast(id?'Product updated':'Product added successfully');
   await loadOwnerProducts();
  }catch(err){$('ownerProductMessage').textContent=err.message;toast(err.message)}
  finally{btn.disabled=false}
 };
 loadOwnerProducts();
}

async function loadRoleOrders(){
 if(!state.token||activePortalRole==='customer')return;
 $('roleOrders').innerHTML='<div class="notice">Loading orders…</div>';
 try{
  if(activePortalRole==='shop_owner'){
   const rows=await api('/delivery/orders/shop-owner');
   $('roleOrders').innerHTML=rows.length?rows.map(o=>{
    const id=Number(o.sale_id),status=String(o.shop_order_status||'pending').toLowerCase();
    let action='';
    if(status==='pending')action=`<button class="btn btn-primary" data-role-action="accept" data-id="${id}">Accept Order</button>`;
    else if(status==='accepted')action=`<button class="btn btn-primary" data-role-action="preparing" data-id="${id}">Start Preparing</button>`;
    else if(status==='preparing')action=`<button class="btn btn-primary" data-role-action="ready" data-id="${id}">Ready for Pickup</button>`;
    const items=(o.items||[]).map(it=>`<div class="role-product-row">${it.image_url?`<img src="${esc(it.image_url)}" alt="${esc(it.product_name||'Product')}" loading="lazy" onerror="this.style.display='none'">`:'<div class="role-product-placeholder">📦</div>'}<div><b>${esc(it.product_name||'Product')}</b><p>Qty: ${Number(it.quantity)||0} × ${money(it.unit_price)}</p><small>Subtotal: ${money(it.subtotal)}</small></div></div>`).join('');
    const details=`<p>Invoice: ${esc(o.invoice_number||('#'+id))}</p><p>Customer: ${esc(o.customer_name||'Customer')}</p><p>Phone: ${esc(o.customer_phone||'Not available')}</p><p>Delivery address: ${esc(o.delivery_address||'—')}</p><p>Payment: ${esc(o.payment_method||'—')}</p><p>Subtotal: ${money(o.subtotal)} · GST: ${money(o.gst_amount)} · Delivery: ${money(o.delivery_fee)}</p><h4>Products</h4><div class="role-product-list">${items||'<p>Product details unavailable</p>'}</div><h3>Total: ${money(o.total_amount)}</h3><p>Delivery status: ${esc(o.delivery_status||'pending')}</p>`;
    return roleCard('Order #'+id,status.replaceAll('_',' '),details,action);
   }).join(''):'<div class="notice">No shop orders found yet.</div>';
  }else{
   const profile=await api('/delivery/profile').catch(()=>null);
   let rows=[];
   try{rows=await api('/delivery/orders/my')}catch(e){if(!String(e.message).includes('404'))throw e}
   let available=[];
   try{available=await api('/delivery/orders/available')}catch(e){if(!String(e.message).includes('403')&&!String(e.message).includes('404'))throw e}
   const onlineButton=profile?.is_online
    ?'<button class="btn btn-light" data-role-action="offline">Go Offline</button>'
    :'<button class="btn btn-primary" data-role-action="online">Go Online</button>';
   let cards=[`<article class="role-order"><h3>Delivery availability</h3><p>${profile?.is_online?'You are online.':'You are offline.'}</p><div class="order-buttons">${onlineButton}</div></article>`];
   for(const o of available){
    const id=Number(o.sale_id);
    cards.push(roleCard('Pickup #'+id,'Ready for pickup',`<p>Invoice: ${esc(o.invoice_number||('#'+id))}</p><p>Total: ${money(o.total_amount)}</p><div class="address-box"><b>Shop pickup address</b><p>Accept this delivery to load the assigned shop address and map.</p></div>`,`<button class="btn btn-primary" data-role-action="delivery-accept" data-id="${id}">Accept Delivery</button>`));
   }
   for(const o of rows){
    const id=Number(o.sale_id),s=String(o.delivery_status||'assigned').toLowerCase();
    const picked=['picked_up','out_for_delivery','delivered'].includes(s);
    const shop=`<div class="address-box"><b>Pickup from ${esc(o.shop_name||'Shop')}</b><p>${esc(o.shop_address||'Shop address unavailable')}</p>${o.shop_latitude&&o.shop_longitude?`<a class="btn btn-light" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(o.shop_latitude+','+o.shop_longitude)}&travelmode=driving">Navigate to shop pickup</a>`:''}</div>`;
    const customer=picked?`<div class="address-box"><b>Customer delivery location</b><p>${esc(o.delivery_address||'Customer address is not available from the server response.')}</p>${o.delivery_latitude&&o.delivery_longitude?`<a class="btn btn-primary" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(o.delivery_latitude+','+o.delivery_longitude)}&travelmode=driving">Navigate to customer</a>`:''}</div>`:'<div class="address-box"><b>Customer location hidden</b><p>Customer address appears only after you confirm pickup.</p></div>';
    let action='';
    if(s==='assigned')action=`<button class="btn btn-primary" data-role-action="picked_up" data-id="${id}">Confirm Pickup</button>`;
    else if(s==='picked_up')action=`<button class="btn btn-primary" data-role-action="out_for_delivery" data-id="${id}">Start Delivery</button>`;
    else if(s==='out_for_delivery')action=`<button class="btn btn-primary" data-role-action="delivery-otp" data-id="${id}">Send Delivery OTP</button><button class="btn btn-light" data-role-action="delivered" data-id="${id}">Mark Delivered (OTP required)</button>`;
    cards.push(roleCard('Order #'+id,s.replaceAll('_',' '),`<p>${esc(o.invoice_number||'')}</p>${shop}${customer}`,action));
   }
   $('roleOrders').innerHTML=cards.join('');
  }
  $('roleOrders').querySelectorAll('[data-role-action]').forEach(b=>b.onclick=()=>runRoleAction(b.dataset.roleAction,b.dataset.id));
 }catch(e){$('roleOrders').innerHTML=`<div class="notice">${esc(e.message)}</div>`}
}
async function runRoleAction(action,id){
 try{
  if(action==='online')await roleAction('/delivery/online');
  else if(action==='offline')await roleAction('/delivery/offline');
  else if(action==='accept')await roleAction(`/shop-owner/orders/${id}/accept`);
  else if(action==='preparing')await roleAction(`/shop-owner/orders/${id}/preparing`);
  else if(action==='ready')await roleAction(`/shop-owner/orders/${id}/ready`);
  else if(action==='delivery-accept')await roleAction(`/delivery/orders/${id}/accept`);
  else if(['picked_up','out_for_delivery'].includes(action))await roleAction(`/delivery/orders/${id}/status`,'PATCH',{status:action});
  else if(action==='delivery-otp'){const r=await roleAction(`/delivery/orders/${id}/delivery-otp`);toast(r.message||'Delivery OTP sent to customer');}
  else if(action==='delivered'){
   const otp=prompt('Enter the customer delivery OTP:');
   if(!otp)return;
   await roleAction(`/delivery/orders/${id}/status`,'PATCH',{status:'delivered',otp});
  }
  toast('Order updated');await loadRoleOrders();await loadRoleNotifications();
 }catch(e){toast(e.message)}
}

$('loginOpen').onclick=()=>state.token?logout():openDialog('loginDialog');
$('loginForm').addEventListener('submit',async e=>{
 e.preventDefault();if(state.authMode!=='login')return;
 const f=new FormData(e.currentTarget);setMessage('loginMessage','Signing in…');
 try{loginSuccess(await api('/auth/login',{method:'POST',body:JSON.stringify({email:String(f.get('email')).trim(),password:f.get('password')})}))}
 catch(err){setMessage('loginMessage',err.message)}
});
let msg91LoginReqId='';
function msg91RequestId(data){
 if(!data)return '';
 if(typeof data==='string')return data;
 const nested=data.data;
 return String(data.reqId||data.req_id||data.request_id||nested?.reqId||nested?.req_id||nested?.request_id||((data.message&&String(data.message).toLowerCase()!=='success')?data.message:'')||'');
}
function msg91AccessToken(data){
 if(!data)return '';
 if(typeof data==='string'&&data.split('.').length===3)return data;
 const nested=data.data;
 const candidate=data['access-token']||data.access_token||data.token||nested?.['access-token']||nested?.access_token||nested?.token;
 if(candidate)return String(candidate);
 const message=data.message?String(data.message):'';
 return message.split('.').length===3?message:'';
}
function msg91Ready(){return typeof window.sendOtp==='function'&&typeof window.verifyOtp==='function'}
$('sendOtp').onclick=async()=>{
 const phone=$('otpPhone').value.trim();
 if(!/^\d{10}$/.test(phone)){setMessage('loginMessage','Enter a valid 10-digit mobile number.');return}
 if(!msg91Ready()){setMessage('loginMessage','MSG91 OTP service is not ready. Refresh the page and try again.');return}
 setMessage('loginMessage','Sending OTP through MSG91…');$('sendOtp').disabled=true;
 try{
  msg91LoginReqId='';
  window.sendOtp('91'+phone,(data)=>{
   msg91LoginReqId=msg91RequestId(data);
   if(!msg91LoginReqId){setMessage('loginMessage','MSG91 sent response did not include a request ID. Please retry.');return}
   setMessage('loginMessage','OTP sent. Please check your phone.');$('otpCode').focus();
  },(error)=>setMessage('loginMessage',error?.message||String(error||'MSG91 could not send OTP.')));
 }catch(e){setMessage('loginMessage',e.message||'Unable to send OTP.')}
 finally{$('sendOtp').disabled=false}
};
$('verifyOtp').onclick=async()=>{
 const phone=$('otpPhone').value.trim(),otp=$('otpCode').value.trim();
 if(!/^\d{10}$/.test(phone)||!/^\d{6}$/.test(otp)){setMessage('loginMessage','Enter a valid phone number and 6-digit OTP.');return}
 if(!msg91LoginReqId){setMessage('loginMessage','Please request a fresh OTP first.');return}
 if(!msg91Ready()){setMessage('loginMessage','MSG91 OTP service is not ready. Refresh the page and try again.');return}
 setMessage('loginMessage','Verifying OTP…');$('verifyOtp').disabled=true;
 window.verifyOtp(otp,async(data)=>{
  try{
   const accessToken=msg91AccessToken(data);
   if(!accessToken)throw Error('MSG91 verification did not return an access token.');
   setMessage('loginMessage','OTP verified. Signing in…');
   const result=await api('/auth/msg91/login',{method:'POST',body:JSON.stringify({phone_number:phone,access_token:accessToken,requested_role:'customer'})});
   if(result.registration_required){
    setMessage('loginMessage','This number is not registered as a 4YOO customer yet. Please create an account first.');
    return;
   }
   loginSuccess(result);
  }catch(e){setMessage('loginMessage',e.message||'Unable to sign in. Please try again.')}
  finally{$('verifyOtp').disabled=false}
 },(error)=>{
  setMessage('loginMessage',error?.message||String(error||'Incorrect or expired OTP.'));
  $('verifyOtp').disabled=false;
 },msg91LoginReqId);
};
$('sendRegOtp').onclick=async()=>{
 const phone=$('regPhone').value.trim();if(!/^\d{10}$/.test(phone)){setMessage('loginMessage','Enter a valid 10-digit mobile number.');return}
 setMessage('loginMessage','Sending registration OTP…');
 try{const r=await api('/auth/otp/send',{method:'POST',body:JSON.stringify({phone_number:phone,purpose:'register'})});setMessage('loginMessage',r.message||'Registration OTP sent.')}
 catch(e){setMessage('loginMessage',e.message)}
};
$('finishRegister').onclick=async()=>{
 const email=$('regEmail').value.trim(),phone=$('regPhone').value.trim(),password=$('regPassword').value,otp=$('regOtp').value.trim();
 if(!email||!/^\d{10}$/.test(phone)||password.length<6||!/^\d{6}$/.test(otp)){setMessage('loginMessage','Enter valid email, 10-digit phone, password (6+ characters) and 6-digit OTP.');return}
 setMessage('loginMessage','Creating customer account…');
 try{const r=await api('/auth/otp/register',{method:'POST',body:JSON.stringify({phone_number:phone,otp,email,password,role:'customer'})});if(r.access_token)loginSuccess(r);else{setAuthMode('login');$('otpPhone').value=phone;setMessage('loginMessage','Account created. Please sign in with your phone OTP or email/password.')}}
 catch(e){setMessage('loginMessage',e.message)}
};
function logout(){document.querySelector('main').hidden=false;document.querySelector('.footer').hidden=false;$('rolePortal').hidden=true;state.token='';state.user=null;state.address=null;state.addresses=[];state.products=[];state.cart=[];state.wishlist=[];localStorage.removeItem('4yoo_token');$('loginOpen').textContent='Login';$('locationText').textContent='Choose your location';renderProducts();renderCart();setNotice('Sign in and choose your delivery location to discover products.');toast('You are signed out.')}
function setNotice(message){$('notice').textContent=message;$('notice').hidden=!message}
function updateLocation(){const a=state.address;$('locationText').textContent=a?(a.label||'Delivery')+' · '+(a.city||a.address||'Saved address'):'Choose your location';$('marketSubtitle').textContent=a?`Showing products available near ${a.city||a.label||'your address'}.`:'Set your delivery location to see available products.'}

async function loadNearbyShops(){
 const notice=$('nearbyShopsNotice'),grid=$('nearbyShopsGrid');
 if(!state.token||!state.address){
  state.shops=[];grid.innerHTML='';
  notice.textContent='Sign in and choose your verified delivery location to discover nearby shops.';
  return;
 }
 const a=state.address;
 const city=String(a.city||'').trim();
 const pin=String(a.pincode||'').trim();
 const lat=Number(a.latitude),lon=Number(a.longitude);
 if(!city||!/^\d{6}$/.test(pin)||!Number.isFinite(lat)||!Number.isFinite(lon)){
  state.shops=[];grid.innerHTML='';
  notice.textContent='Your saved address is missing verified city, pincode or GPS details. Please update your delivery address.';
  return;
 }
 notice.textContent='Finding approved shops within 10 km…';
 try{
  const q=new URLSearchParams({city,latitude:String(lat),longitude:String(lon),pincode:pin,radius_km:'10'});
  const result=await api('/shop-owner/nearby?'+q.toString());
  state.shops=Array.isArray(result.shops)?result.shops:[];
  $('nearbyShopsSubtitle').textContent=`${state.shops.length} approved shop(s) found near ${city}.`;
  if(!state.shops.length){
   grid.innerHTML='';
   notice.textContent='No approved shops are currently available within 10 km of this location. We will show shops when they become available.';
   return;
  }
  notice.textContent='';
  grid.innerHTML=state.shops.map(s=>{
   const name=esc(s.shop_name||'Local Shop');
   const address=esc([s.address,s.city].filter(Boolean).join(', '));
   const distance=Number(s.distance_km);
   const map=Number.isFinite(Number(s.latitude))&&Number.isFinite(Number(s.longitude))
    ?`<a class="btn btn-light" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${encodeURIComponent(s.latitude+','+s.longitude)}">View map</a>`:'';
   return `<article class="nearby-shop-card"><div class="nearby-shop-icon">🏪</div><div class="nearby-shop-info"><h3>${name}</h3><p>${address||'Address not available'}</p><span class="shop-distance">${Number.isFinite(distance)?distance.toFixed(2)+' km away':'Nearby shop'}</span><div class="nearby-shop-actions">${map}<a class="btn btn-primary" href="#products">Explore products</a></div></div></article>`;
  }).join('');
 }catch(e){
  state.shops=[];grid.innerHTML='';
  notice.textContent='Nearby shops could not be loaded: '+e.message;
 }
}
$('addressOpen').onclick=()=>{if(requireLogin())openAddressDialog()};
$('heroLocation').onclick=$('bottomLocation').onclick=()=>{if(requireLogin())openAddressDialog()};
$('heroShop').onclick=()=>$('products').scrollIntoView({behavior:'smooth'});
$('refreshNearbyShops').onclick=()=>loadNearbyShops();
$('refreshProducts').onclick=()=>state.token?loadProducts():openDialog('loginDialog');
async function openAddressDialog(){openDialog('addressDialog');setMessage('addressMessage','');await loadAddresses(true)}
async function loadAddresses(render=true){
 const rows=await api('/customer-addresses');state.addresses=Array.isArray(rows)?rows:[];
 state.address=state.addresses.find(a=>a.is_default)||state.addresses[0]||null;
 if(state.address&&!state.address.is_default){state.address=await api(`/customer-addresses/${state.address.id}/default`,{method:'PUT'});state.addresses=await api('/customer-addresses');}
 if(render)renderAddresses();
 updateLocation();
 await loadNearbyShops();
}
function renderAddresses(){
 const box=$('savedAddresses');
 if(!state.addresses.length){box.innerHTML='<p class="muted">No saved delivery addresses yet.</p>';return}
 box.innerHTML=state.addresses.map(a=>`<div class="saved-address ${state.address&&Number(state.address.id)===Number(a.id)?'active':''}"><input type="radio" name="savedAddress" value="${Number(a.id)}" ${state.address&&Number(state.address.id)===Number(a.id)?'checked':''}><label><b>${esc(a.label||'Delivery address')} ${a.is_default?'· Default':''}</b><small>${esc(a.address)}${a.city?' · '+esc(a.city):''}${a.pincode?' - '+esc(a.pincode):''}</small></label></div>`).join('');
 box.querySelectorAll('input[name=savedAddress]').forEach(input=>input.onchange=async()=>{try{const id=Number(input.value);state.address=await api(`/customer-addresses/${id}/default`,{method:'PUT'});await loadAddresses();await loadProducts();toast('Delivery address updated');$('addressDialog').close()}catch(e){toast(e.message)}});
}
$('gpsButton').onclick=()=>{
 if(!navigator.geolocation){setMessage('addressMessage','GPS is not supported by this browser.');return}
 setMessage('addressMessage','Getting your GPS location…');
 navigator.geolocation.getCurrentPosition(p=>{$('addressForm').elements.latitude.value=p.coords.latitude;$('addressForm').elements.longitude.value=p.coords.longitude;setMessage('addressMessage','GPS captured. Enter the complete address including city, state and 6-digit pincode.')},e=>setMessage('addressMessage','GPS error: '+e.message),{enableHighAccuracy:true,timeout:15000});
};
$('addressForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!requireLogin())return;
 const f=new FormData(e.currentTarget),payload={label:String(f.get('label')).trim(),address:String(f.get('address')).trim(),latitude:Number(f.get('latitude')),longitude:Number(f.get('longitude')),is_default:true};
 if(!payload.label||!payload.address||!Number.isFinite(payload.latitude)||!Number.isFinite(payload.longitude)){setMessage('addressMessage','Complete all address fields and capture GPS.');return}
 setMessage('addressMessage','Verifying and saving address…');
 try{await api('/customer-addresses',{method:'POST',body:JSON.stringify(payload)});await loadAddresses();await loadProducts();$('addressDialog').close();toast('Delivery address saved');e.currentTarget.reset()}
 catch(err){setMessage('addressMessage',err.message)}
});
async function loadProducts(){
 if(!state.token){state.products=[];renderProducts();setNotice('Sign in and choose your delivery location to discover products.');return}
 setNotice('Loading nearby products…');
 try{const rows=await api('/products/marketplace');state.products=Array.isArray(rows)?rows:[];state.category='all';renderCategories();renderProducts();setNotice(state.products.length?'':'No products are currently available for your saved service location.')}
 catch(e){state.products=[];renderCategories();renderProducts();setNotice(e.message)}
}
function renderCategories(){
 const cats=[...new Set(state.products.map(p=>p.category).filter(Boolean))].sort();
 $('categories').innerHTML='<button class="category '+(state.category==='all'?'active':'')+'" data-cat="all">All products</button>'+cats.map(c=>`<button class="category ${state.category===c?'active':''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
 $('categories').querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{state.category=b.dataset.cat;renderCategories();renderProducts()});
}
function isWish(id){return state.wishlist.some(w=>Number(w.product_id)===Number(id)||Number(w.product?.id)===Number(id))}
function renderProducts(){
 const q=$('search').value.trim().toLowerCase();
 const rows=state.products.filter(p=>(state.category==='all'||p.category===state.category)&&`${p.name||''} ${p.description||''} ${p.category||''}`.toLowerCase().includes(q));
 $('productsGrid').innerHTML=rows.map(p=>{
  const img=imageUrl(p.image_url),price=Number(p.selling_price||0),disc=Math.max(0,Math.min(100,Number(p.discount_percent||0))),final=price*(1-disc/100),stock=Number(p.stock_quantity||0);
  return `<article class="product-card"><div class="product-image" data-detail="${Number(p.id)}">${img?`<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.hidden=false">`:''}<span class="placeholder" ${img?'hidden':''}>🛍️</span>${disc?`<span class="discount-tag">${disc}% OFF</span>`:''}</div><div class="product-info"><h3>${esc(p.name)}</h3><p>${esc(p.category||p.description||'Local product')}</p>${p.offer_active&&p.offer_title?`<p class="offer">${esc(p.offer_title)}</p>`:''}<div class="price-line"><span class="price">${money(final)}</span>${disc?`<span class="old-price">${money(price)}</span>`:''}</div><span class="stock">${stock>0?stock+' available':'Out of stock'}</span><div class="product-actions"><button class="btn btn-primary add-btn" data-add="${Number(p.id)}" ${stock<=0?'disabled':''}>Add to cart</button><button class="wish-btn ${isWish(p.id)?'active':''}" data-wish="${Number(p.id)}" aria-label="Toggle wishlist">${isWish(p.id)?'♥':'♡'}</button></div></div></article>`;
 }).join('');
 if(!rows.length&&state.products.length)$('productsGrid').innerHTML='<div class="notice">No products match your search.</div>';
 $('productsGrid').querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>addToCart(Number(b.dataset.add)));
 $('productsGrid').querySelectorAll('[data-wish]').forEach(b=>b.onclick=()=>toggleWish(Number(b.dataset.wish)));
 $('productsGrid').querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>showProduct(Number(b.dataset.detail)));
}
$('search').addEventListener('input',renderProducts);
async function loadCart(){
 if(!state.token){state.cart=[];renderCart();return}
 try{const rows=await api('/cart');state.cart=Array.isArray(rows)?rows:[];renderCart()}catch(e){toast('Cart: '+e.message)}
}
async function addToCart(id){if(!requireLogin())return;try{await api('/cart',{method:'POST',body:JSON.stringify({product_id:id,quantity:1})});await loadCart();toast('Added to cart')}catch(e){toast(e.message)}}
function renderCart(){
 const count=state.cart.reduce((n,i)=>n+Number(i.quantity||0),0);$('cartCount').textContent=count;
 $('cartItems').innerHTML=state.cart.length?state.cart.map(i=>`<div class="cart-row"><div><b>${esc(i.product_name||'Product')}</b><span>${money(i.selling_price)} × ${Number(i.quantity)}</span></div><div class="qty-controls"><button data-dec="${Number(i.id)}" aria-label="Decrease">−</button><b>${Number(i.quantity)}</b><button data-inc="${Number(i.id)}" aria-label="Increase">+</button><button data-rem="${Number(i.id)}" aria-label="Remove">×</button></div></div>`).join(''):'<p class="muted">Your cart is empty. Add a nearby product to get started.</p>';
 $('cartTotal').textContent=money(state.cart.reduce((n,i)=>n+Number(i.subtotal||Number(i.selling_price||0)*Number(i.quantity||0)),0));
 $('cartItems').querySelectorAll('[data-dec],[data-inc],[data-rem]').forEach(b=>b.onclick=async()=>{
  const id=Number(b.dataset.dec||b.dataset.inc||b.dataset.rem),item=state.cart.find(i=>Number(i.id)===id);if(!item)return;
  try{if(b.dataset.rem||Number(item.quantity)+(b.dataset.inc?1:-1)<1)await api('/cart/'+id,{method:'DELETE'});else await api('/cart/'+id,{method:'PUT',body:JSON.stringify({quantity:Number(item.quantity)+(b.dataset.inc?1:-1)})});await loadCart()}catch(e){setMessage('cartMessage',e.message)}
 });
}
$('cartOpen').onclick=async()=>{if(!requireLogin())return;setMessage('cartMessage','');await loadCart();openDialog('cartDialog')};
async function cashCheckout(){
 if(!requireLogin())return;if(!state.address){setMessage('cartMessage','Please save/select a delivery address first.');return}if(!state.cart.length){setMessage('cartMessage','Your cart is empty.');return}
 setMessage('cartMessage','Placing your order…');
 try{const q=new URLSearchParams({payment_method:'cash',address_id:String(state.address.id)});const order=await api('/cart/checkout?'+q,{method:'POST'});await loadCart();await loadProducts();setMessage('cartMessage','');$('cartDialog').close();toast('Order placed successfully');await showOrders(order.id)}
 catch(e){setMessage('cartMessage',e.message)}
}
$('cashCheckout').onclick=cashCheckout;
async function loadRazorpay(){if(window.Razorpay)return;await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://checkout.razorpay.com/v1/checkout.js';s.onload=resolve;s.onerror=()=>reject(Error('Unable to load secure payment checkout.'));document.head.appendChild(s)})}
$('onlineCheckout').onclick=async()=>{
 if(!requireLogin())return;if(!state.address){setMessage('cartMessage','Please save/select a delivery address first.');return}if(!state.cart.length){setMessage('cartMessage','Your cart is empty.');return}
 setMessage('cartMessage','Preparing secure Razorpay checkout…');
 try{
  await loadRazorpay();
  const q=new URLSearchParams({address_id:String(state.address.id)});
  const order=await api('/payment/create-order?'+q,{method:'POST',body:JSON.stringify({})});
  if(!order.order_id||!order.key_id||!order.amount)throw Error('Payment order response is incomplete.');
  $('cartDialog').close();
  // Backend returns amount in paise (amount_paise); do not multiply by 100 again.
  const checkout=new Razorpay({key:order.key_id,amount:Number(order.amount),currency:order.currency||'INR',name:'4YOO',description:'4YOO customer order',order_id:order.order_id,prefill:{email:state.user?.email||''},handler:async response=>{
   try{await api('/payment/verify',{method:'POST',body:JSON.stringify({razorpay_payment_id:response.razorpay_payment_id,razorpay_order_id:response.razorpay_order_id,razorpay_signature:response.razorpay_signature})});await loadCart();await loadProducts();toast('Payment verified and order placed');await showOrders()}
   catch(e){alert('Payment verification was not confirmed: '+e.message+'. Please check My Orders before attempting another payment.')}
  },modal:{ondismiss:()=>toast('Payment window closed')}});
  checkout.on('payment.failed',r=>alert('Payment failed: '+(r.error?.description||'Please try again')));
  checkout.open();
 }catch(e){openDialog('cartDialog');setMessage('cartMessage',e.message)}
};
async function toggleWish(id){
 if(!requireLogin())return;
 try{if(isWish(id))await api('/wishlist/'+id,{method:'DELETE'});else await api('/wishlist/'+id,{method:'POST'});state.wishlist=await api('/wishlist');renderProducts();toast(isWish(id)?'Wishlist updated':'Saved to wishlist')}
 catch(e){toast(e.message)}
}
async function showProduct(id){
 try{const p=await api('/products/'+id);const img=imageUrl(p.image_url);$('productDetail').innerHTML=`${img?`<img class="detail-image" src="${esc(img)}" alt="${esc(p.name)}">`:''}<h2>${esc(p.name)}</h2><p class="muted">${esc(p.category||'Local product')}</p><p>${esc(p.description||'')}</p><h3>${money(p.selling_price)}</h3><p class="muted">${Number(p.stock_quantity||0)>0?Number(p.stock_quantity)+' available':'Currently out of stock'}</p><button class="btn btn-primary full" id="detailAdd" ${Number(p.stock_quantity||0)<=0?'disabled':''}>Add to cart</button>`;$('detailAdd').onclick=async()=>{await addToCart(id);$('productDialog').close()};openDialog('productDialog')}
 catch(e){toast(e.message)}
}
async function showOrders(highlightId){
 if(!requireLogin())return;
 try{
  const rows=await api('/sales');
  $('ordersList').innerHTML=Array.isArray(rows)&&rows.length?rows.map(o=>{
   const id=Number(o.id),delivered=String(o.delivery_status||'').toLowerCase()==='delivered';
   const receipt=delivered&&!o.receipt_confirmed
    ?`<button class="btn btn-primary" data-confirm-receipt="${id}">Confirm Receipt</button>`:'';
   const rate=delivered
    ?`<button class="btn btn-light" data-rate-order="${id}">Rate Shop</button>`:'';
   return `<article class="order-card"><b>Order ${esc(o.invoice_number||('#'+id))}</b>
    <p>Status: ${esc(o.delivery_status||o.shop_order_status||o.status||'pending')}</p>
    <p>Total: ${money(o.total_amount)}</p>
    ${o.receipt_confirmed?'<p>Receipt confirmed ✓</p>':''}
    ${Number(o.id)===Number(highlightId)?'<b class="stock">Just placed</b>':''}
    <div class="order-buttons">${receipt}${rate}</div></article>`;
  }).join(''):'<p class="muted">No orders yet.</p>';
  $('ordersList').querySelectorAll('[data-confirm-receipt]').forEach(b=>b.onclick=async()=>{
   b.disabled=true;
   try{
    await api(`/customer/orders/${b.dataset.confirmReceipt}/confirm-receipt`,{method:'POST'});
    toast('Receipt confirmed successfully');
    await showOrders();
   }catch(e){toast(e.message);b.disabled=false}
  });
  $('ordersList').querySelectorAll('[data-rate-order]').forEach(b=>b.onclick=async()=>{
   const rating=Number(prompt('Rate this shop from 1 to 5:'));
   if(!Number.isInteger(rating)||rating<1||rating>5){toast('Please enter a rating from 1 to 5');return}
   const review=prompt('Write an optional review:')||'';
   b.disabled=true;
   try{
    await api('/shop-ratings',{method:'POST',body:JSON.stringify({sale_id:Number(b.dataset.rateOrder),rating,review})});
    toast('Thank you for your review');
    b.remove();
   }catch(e){toast(e.message);b.disabled=false}
  });
  openDialog('ordersDialog');
 }catch(e){toast(e.message)}
}
function addAccountButton(){
 if(document.querySelector('[data-orders-button]'))return;
 const b=document.createElement('button');b.className='text-btn';b.textContent='My orders';b.dataset.ordersButton='1';b.onclick=()=>showOrders();$('loginOpen').before(b);
}
async function initCustomer(){
 try{await loadAddresses();if(state.address)await loadProducts();else{setNotice('Add a verified delivery address to see shops and products near you.');openDialog('addressDialog');renderAddresses()}await loadCart();try{state.wishlist=await api('/wishlist')}catch{state.wishlist=[]}renderProducts();addAccountButton()}
 catch(e){setNotice(e.message)}
}
async function init(){
 setAuthMode('login');
 if(state.token){
  $('loginOpen').textContent='Logout';
  try{
   const me=await api('/auth/me');
   state.user=me.user||me;
   await initActiveRole();
  }catch(e){
   state.user={role:'customer',roles:['customer']};
   await initCustomer();
  }
 }else{setNotice('Sign in and choose your delivery location to discover products.');renderCart()}
}
init();
})();