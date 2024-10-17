/**
 * Clear cache : https://www.jsdelivr.com/tools/purge
 * https://cdn.jsdelivr.net/gh/lucead/prebid-js-external-js-lucead@master/dist/prod.min.js
 * https://raw.githubusercontent.com/lucead/prebid-js-external-js-lucead/master/dist/prod.min.js
 *
 * ORTB Docs: https://publisher.docs.themediagrid.com/grid/buyer-ortb-protocol/source.html#source-object
 * https://publisherdocs.criteotilt.com/prebid/
 * https://pmc.criteo.com/
 *
 * https://www8.smartadserver.com/imp?imgid=39534936&tmstp=[timestamp]&tgt=[targeting] GRID
 * https://www8.smartadserver.com/imp?imgid=39534938&tmstp=[timestamp]&tgt=[targeting] Magnite
 * https://www8.smartadserver.com/imp?imgid=39534939&tmstp=[timestamp]&tgt=[targeting] Criteo
 */

import * as storage from './storage.js';
import {error,get_device,log,is_chrome} from './utils.js';

const version='v1017.1';
const fetch_timeout=1800; //individual fetch timemout
const prerender_pa=true; // to trigger win report
const enable_sr=false;
const enable_cookie_sync=true;
const enable_autorefresh_blocker=true;
const enable_measure_features=true;
// noinspection JSUnusedLocalSymbols
const pbjs=window.rtbpbjs || window.pbjs || window._abPbJs;
let site=window.lucead_site;
const is_dev=window.location.hash.includes('prebid-dev');
let call_id=0;//incremented on each lucead_prebid() call
let endpoint_url='https://lucead.com';
//const stored_response_prefix='response';

function get_stored_response_key(placement_id)
{
	return `response-${placement_id}`;
}

function get_schain()
{
	let schain={
		ver:'1.0',
		complete:1,
		nodes:[],
	};

	if(site?.schain_domain && site?.schain_id)
	{
		schain.nodes.push({
			asi:site.schain_domain,
			sid:site.schain_id,
			hp:1,
		});
	}

	/*if(pbjs && pbjs.getConfig('schain'))
	{
		for(const node of pbjs?.getConfig('schain')?.nodes)
		{
			schain.nodes.push(node);
		}
	}*/

	return schain;
}

function uniqid()
{
	return `${Math.trunc(Math.random()*1000000000)}`;
};

/*function add_tag()
{
	const tag=document.createElement('script');
	tag.src='https://s.lucead.com/tag/2747166919.js';
	top.document.body.appendChild(tag);
}

function send_log(bid)
{
	fetch(`https://lucead.com/log`,{
		method:'POST',
		body:JSON.stringify({
			version,
			url:location.href,
			...bid,
		}),
	});
}

function cookiematch()
{
	for(let i=1;i<=4;++i)
	{
		setTimeout(()=>{
			new Image().src='https://x.bidswitch.net/sync?ssp=themediagrid';
		},1000*i);
	}

	/*const iframe=document.createElement('iframe');
	iframe.src='\n'+
		'https://ads.pubmatic.com/AdServer/js/user_sync.html?kdntuid=1&p=';
	iframe.style.display='none';
	document.body.appendChild(iframe);* /
}*/

//setTimeout(cookiematch,1000);

// noinspection JSUnusedLocalSymbols
function measure_features()
{
	const key='mesured';
	if(storage.get(key)) return;
	storage.set(key,'1',86400*7);

	const pa_on=!!navigator.runAdAuction;
	const topics_on=!!document.browsingTopics;
	const url=`${endpoint_url}/go/report/features?is_chrome=${is_chrome()?1:0}&pa_on=${pa_on?1:0}&topics_on=${topics_on?1:0}&domain=${encodeURIComponent(location.hostname)}`;
	fetch(url);
	/*const iframe=document.createElement('iframe');
	iframe.id='lucead-measure-features';
	iframe.src=url;
	iframe.style.display='none';
	document.body.appendChild(iframe);*/
}

async function fetchWithTimeout(resource,options={})
{
	const {timeout=fetch_timeout}=options;

	const controller=new AbortController();
	const id=setTimeout(()=>controller.abort(),timeout);

	try
	{
		const response=await fetch(resource,{
			...options,
			signal:controller.signal,
			credentials:'include',
		});

		clearTimeout(id);
		return response;
	}
	catch(e)
	{
		error(e);
		clearTimeout(id);
		return null;
	}
}

function embed_html(html,ssp=null,placement_id=null)
{
	if(!html)
		return null;

	//add lucead render tracking
	if(ssp && placement_id)
	{
		const params=JSON.stringify({
			ssp,
			placement_id,
			domain:location.hostname,
			metric:'renders',
		});

		html+=`<script>navigator.sendBeacon('${endpoint_url}/go/report/impression','${params}');</script>`;

		const smart_pixels={grid:39534936,magnite:39534938,criteo:39534939};

		if(smart_pixels[ssp])
		{
			//html+=`<img alt="${ssp}" src="https://www8.smartadserver.com/imp?imgid=${smart_pixels[ssp]}&tmstp=${Date.now()}&tgt=" style="display:none" />`;
			(new Image()).src=`https://www8.smartadserver.com/imp?imgid=${smart_pixels[ssp]}&tmstp=${Date.now()}&tgt=`;
		}
	}

	if(html.includes('<html'))
		return html;

	return `<html lang="en"><body style="margin:0;background-color:#FFF">${html}</body></html>`;
}

function get_ortb_data(data,bidRequest)
{
	let payload=data.ortbConverter({}).toORTB({bidRequests:[bidRequest],bidderRequest:data.bidderRequest});

	//debugger;
	if(payload?.device?.geo)//shaalaa fix
	{
		delete payload.device.devicetype;
		delete payload.device.flashver;
		delete payload.device.js;
		delete payload.device.lmt;
		delete payload.device.pxratio;
		delete payload.device.ppi;
		delete payload.device.language;
		delete payload.site.mobile;
		delete payload.device.carrier;
		delete payload.device.ip;
		delete payload.device.geo;
		delete payload.device.geofetch;
		delete payload.content;
		delete payload.cur;
		delete payload.publisher;
		delete payload.site.cat;
		delete payload.site.name;
		delete payload.site.pagecat;
		delete payload.site.privacypolicy;
		delete payload.site.sectioncat;
	}

	if(data.consent)
	{
		data.deepSetValue(payload,'user.ext.consent',data?.consent?.tcString);
		data.deepSetValue(payload,'regs.ext.gdpr',data?.consent?.gdprApplies ? 1 : 0);
	}
	else
		data.deepSetValue(payload,'regs.ext.gdpr',0);

	if(payload.imp?.length && bidRequest?.sizes?.length)
	{
		for(const imp of payload.imp)
		{
			imp.banner.w=bidRequest.sizes[0][0];
			imp.banner.h=bidRequest.sizes[0][1];
		}
	}

	/*if(payload?.site?.page && payload?.site?.page.includes('://'))
	{
		//payload.site.page=encodeURIComponent(payload.site.page);
	}*/

	if(!payload?.source?.ext?.wrapper)
	{
		data.deepSetValue(payload,'source.ext.wrapper','Prebid_js');
		data.deepSetValue(payload,'source.ext.wrapper_version',data?.prebid_version || window?.pbjs?.version)
	}

	if(bidRequest?.userIdAsEids)
	{
		data.deepSetValue(payload,'user.ext.eids',bidRequest.userIdAsEids);
	}

	//data.deepSetValue(payload,'device.js',1);
	//data.deepSetValue(payload,'at',1);
	//data.deepSetValue(payload,'cur',['USD']);

	//schain

	const schain=get_schain();

	if(schain)
		data.deepSetValue(payload,'source.ext.schain',schain);//pbjs.getConfig('schain')

	return payload;
};

function get_seatbid(result,ssp=null,placement_id=null)
{
	if(!result?.seatbid?.length)
		return null;

	let bids=result.seatbid[0].bid.filter(b=>b && b.price>0 && b.adm);// && b.w===size.width && b.h===size.height
	bids.sort((a,b)=>b.price-a.price);

	let bid=bids[0];

	return {
		cpm:bid?.price || 0,
		currency:result.cur||'USD',
		ad:embed_html(bid?.adm || null,ssp,placement_id),
		size:{
			width:bid?.w,// || size.width,
			height:bid?.h,// || size.height,
		},
		ssp,
		advertiser_domains:bid?.adomain || null,
	};
}

// {gdprApplies: true, tcString: '...'}
// window.__tcfapi('getTCData',2,console.log);
async function get_gdpr()
{
	return new Promise(resolve=>{
		if(window.__tcfapi)
		{
			window.__tcfapi('getTCData',2,(tcData,success)=>{
				resolve(success?tcData:null);
			});
		}
		else
			resolve(null);
	});
}

//sync cookies
function sync_cookies(consent)
{
	if(storage.get('sync')) return;
	storage.set('sync',1,86400);
	const params=`gdpr=${Number(consent.gdprApplies)}&gdpr_consent=${consent.tcString}`

	const urls=[
		`https://hb.360yield.com/prebid-universal-creative/load-cookie.html?pbs=1&${params}`,
		`https://eus.rubiconproject.com/usync.html?${params}`,
	];

	for(const url of urls)
	{
		const iframe=document.createElement('iframe');
		iframe.id='lucead-cookie-sync';
		iframe.src=url;
		iframe.style.display='none';
		document.body.appendChild(iframe);
	}
}

/*async function get_placements_info(data)
{
	try
	{
		return await fetch(`${data.static_url}/placements/info?ids=`+data.bidRequests.map(r=>r?.params.placementId).join(',')).then(r=>r.json());
	}
	catch(e)
	{
		return null;
	}
}*/

async function get_site(data)
{
	try
	{
		return await fetch(`${data.static_url}/prebid/site?p=`+data.bidRequests[0].params.placementId).then(r=>r.json());
	}
	catch(e)
	{
		return null;
	}
}

async function get_pa_bid({base_url,sizes,placement_id,bidRequest,bidderRequest,floor,is_sra,endpoint_url})
{
	sizes||=[{width:300,height:250}];
	const ig_owner=base_url;
	const device=get_device();

	const auctionConfig={
		seller:ig_owner,
		decisionLogicUrl:`${ig_owner}/js/ssp.js`,
		interestGroupBuyers:[ig_owner,'https://ps.avads.net'],
		auctionSignals:{
			sizes,
			placement_id,
		},
		requestedSize:sizes[0],
		sellerSignals:{},
		sellerTimeout:1000,
		sellerCurrency:'USD',
		//deprecatedRenderURLReplacements:{'${AD_WIDTH}':'300','%%SELLER_ALT%%':'exampleSSP'},
		perBuyerSignals:{
			[ig_owner]:{
				prebid_bid_id:bidRequest?.bidId,
				prebid_request_id:window.lucead_request_id || bidderRequest?.bidderRequestId,
				placement_id,
				floor,
				is_sra,
				endpoint_url,
				device,
				is_dev,
			},
			'https://ps.avads.net':{
				currency:'EUR',
			}
		},
		perBuyerTimeouts:{'*':1000},
		resolveToConfig:false,
		dataVersion:2,
		deprecatedReplaceInURN:{'${PLACEMENT_ID}':placement_id,'${DOMAIN}':location.hostname},// needs FLAG FledgeDeprecatedRenderURLReplacements
	};

	let selected_ad;

	if(!navigator.runAdAuction || location.hash.includes('skip-pa'))
		selected_ad=null;
	else
	{
		selected_ad=await navigator.runAdAuction(auctionConfig);
	}

	//Antvoice
	if(selected_ad)
	{
		const iframe=document.createElement('iframe');//force the request to url, to trigger the report network request
		iframe.id='lucead-antvoice-test';
		iframe.src=selected_ad;
		iframe.style.display='none';
		document.body.appendChild(iframe);
		//iframe.remove();
		selected_ad=null;
	}

	//log('PAAPI',placement_id,selected_ad);

	if(selected_ad)
	{
		await navigator.deprecatedReplaceInURN(selected_ad,{'${PLACEMENT_ID}':placement_id,'${DOMAIN}':location.hostname});

		//prerender ad to trigger win report
		if(prerender_pa)
		{
			const iframe=document.createElement('iframe');//force the request to url, to trigger the report network request
			iframe.src=selected_ad;
			iframe.style.display='none';
			document.body.appendChild(iframe);
			iframe.remove();
		}

		//css to hide iframe scrollbars: iframe{overflow:hidden}
		// noinspection HtmlDeprecatedAttribute
		return {
			bid_id:bidRequest?.bidId,
			ad:embed_html(`<iframe src="${selected_ad}" style="width:100%;height:100%;border:none;overflow:hidden" seamless="seamless" scrolling="no" ></iframe>`),
			is_pa:true,
			placement_id,
		};
	}
	else
		return null;
}

async function get_all_responses(data)
{
	const site=data.site;

	return await Promise.all(data.bidRequests.map(async bidRequest=>{
		const empty_response={
			bid_id:bidRequest?.bidId,
			bid:0,
			ad:null,
			size:null,
			placement_id:bidRequest?.params?.placementId || data.placement_id,
		};

		/*const size={
			width:bidRequest.sizes[0][0] || 300,
			height:bidRequest.sizes[0][1] || 250,
		};*/

		const sizes=bidRequest.sizes.map(s=>({width:s[0],height:s[1]}));

		try
		{
			const placement_id=bidRequest?.params?.placementId;

			if(!placement_id || (enable_autorefresh_blocker && call_id>=1))
				return empty_response;

			const pa_response=await get_pa_bid({
				...data,
				sizes,
				placement_id,
				data,
				bidRequest,
			});

			if(pa_response)
				return pa_response;

			const placement=site.placements[placement_id]||null;

			if(!placement?.ssps)
			{
				log('No placement',placement_id);
				return empty_response;
			}

			if(enable_sr)
			{
				const response=storage.get(get_stored_response_key(placement_id))

				if(response)
				{
					response.bid_id=bidRequest.bidId;
					return response;
				}
			}

			let ssp_responses=[];

			if(placement?.ssps?.improve)
			{
				ssp_responses.push(get_improve_bid({
					...data,
					//size,
					placement_id,
					ssp_placement_id:placement?.ssps?.improve,
					data,
					bidRequest,
				}));
			}

			if(placement?.ssps?.grid)
			{
				ssp_responses.push(get_grid_bid({
					...data,
					//size,
					placement_id,
					ssp_placement_id:placement?.ssps.grid,
					deepSetValue:data.deepSetValue,
					data,
					bidRequest,
				}));
			}

			if(placement?.ssps?.criteo)
			{
				ssp_responses.push(get_criteo_bid({
					...data,
					data,
					placement_id,
					ssp_placement_id:placement?.ssps.criteo,
					bidRequest,
				}));
			}

			if(placement?.ssps?.smart)
			{
				ssp_responses.push(get_smart_bid({
					...data,
					sizes:bidRequest.sizes,
					//size,
					placement_id,
					ssp_placement_id:placement?.ssps?.smart,
					transaction_id:bidRequest.transactionId,
					bid_id:bidRequest.bidId,
					ad_unit_code:bidRequest.adUnitCode,
					deepSetValue:data.deepSetValue,
					data,
					bidRequest,
				}));
			}

			if(placement?.ssps?.pubmatic)
			{
				ssp_responses.push(get_pubmatic_bid({
					...data,
					//size,
					placement_id,
					ssp_placement_id:placement?.ssps?.pubmatic,
					transaction_id:bidRequest.transactionId,
					bid_id:bidRequest.bidId,
					ad_unit_code:bidRequest.adUnitCode,
					data,
					bidRequest,
				}));
			}

			if(placement?.ssps?.magnite)
			{
				ssp_responses.push(get_magnite_bid({
					...data,
					placement_id,
					ssp_placement_id:placement?.ssps?.magnite,
					ad_unit_code:bidRequest.adUnitCode,
					data,
					bidRequest,
					placement,
				}));
			}

			if(placement?.ssps?.unruly)
			{
				ssp_responses.push(get_unruly_bid({
					...data,
					data,
					placement_id,
					ssp_placement_id:placement.ssps.unruly,
					bidRequest,
				}));
			}

			if(!ssp_responses.length)
				return empty_response;

			let bids=await Promise.all(ssp_responses);
			if(bids===null || !bids?.length)
			{
				//log('No bids',placement_id,bids);
				return empty_response;
			}
			bids=bids.filter(b=>b && b.cpm);

			//log('SSP Bids',placement_id,bids);

			if(bids?.length)
			{
				if(!bids[0]?.is_pa)
					bids.sort((a,b)=>(b?.cpm || 0)-(a?.cpm || 0));
				let winner=bids[0];

				if(winner.ssp) winner.cpm*=.8;
				winner.bid_id=bidRequest.bidId;
				//winner.size=size;
				winner.placement_id=placement_id;

				if(enable_sr)
				{
					const markup=`<script>top.lucead_rendered("${placement_id}")</script>`;

					if(winner.ad.includes('</body>'))
						winner.ad=winner.ad.replace('</body>',markup+'</body>');
					else
						winner.ad+=markup;

					storage.set(get_stored_response_key(placement_id),winner,86400);
				}

				return winner;
			}
			else
				return empty_response;
		}
		catch(e)
		{
			error(e);
			return empty_response;
		}
	}));
}

async function lucead_prebid(data)
{
	const request_id=window.lucead_request_id || data.request_id;

	if(!site)
		site=await get_site(data);

	if(site?.js)
		// noinspection CommaExpressionJS
		(0,eval)(site.js);

	if(data.endpoint_url)
		endpoint_url=data.endpoint_url.replace('/go','');

	data.site=site;
	data.consent=await get_gdpr();
	is_dev && log('Lucead for Prebid ',version,data);
	//performance.mark('lucead-start');
	let responses=null;

	if(enable_cookie_sync)
		setTimeout(()=>sync_cookies(data.consent),5000);

	if(enable_measure_features)
		setTimeout(measure_features,5000);

	try
	{
		responses=await get_all_responses(data);
	}
	catch(e)
	{
		error(e);
	}

	//performance.mark('lucead-end');
	//log(version,responses,performance.measure('lucead-all-responses','lucead-start','lucead-end'));

	fetch(`${endpoint_url}/go/prebid/pub`,{
		method:'POST',
		contentType:'text/plain',
		body:JSON.stringify({
			request_id,
			pa_enabled:'runAdAuction' in navigator?'on':'off',
			domain:location.hostname,
			responses,
			is_sra:data.is_sra,
			call_id,
		}),
	}).catch(error);

	++call_id;
	//measure_features_support(data.base_url);
};

window.lucead_rendered=function(placement_id) {
	const key=get_stored_response_key(placement_id);
	log('rendered',placement_id,storage.get(key));
	storage.remove(key);
};

const is_mock=location.hash.includes('lucead-mock');

async function get_improve_bid({
	data,
	bidRequest,
	prebid_version,
	placement_id,
	ssp_placement_id,
})
{
	let parts=ssp_placement_id.toString().split(':');

	let endpoint_url=is_mock ?
		'https://adapting-opossum-stunning.ngrok-free.app/test-prebid?mock=improve' :
		'https://ad.360yield.com'+(parts.length===2?'/'+parts[0]:'')+'/pb';

	if(location.hash.includes('lucead-debug'))
		endpoint_url+='?debug=1&ivt_bypass=1';

	const payload=get_ortb_data(data,bidRequest);
	//ortb.imp[0].ext.bidder={placementId:parseInt(placement_id) || 22511670};

	payload.imp=[{
		ext:{
			tid:payload.source.tid,
			bidder:parts.length===2 ? {
				placementId:parseInt(parts[1]) || 22511670,
				publisherId: parseInt(parts[0]) || 1159,
			}:{
				placementId:parseInt(parts[0]) || 22511670,
			},
		},
		banner:{topframe:1},
		id:bidRequest.bidId,
		secure:1,
	}];
	// noinspection JSValidateTypes
	payload.imp[0].banner.format=bidRequest.sizes.map(s=>({w:s[0],h:s[1]}));
		//[{w:bidRequest.sizes[0][0]||300,h:bidRequest.sizes[0]?[1]||250}];
	payload.id=bidRequest.bidderRequestId;
	payload.ext={
		improvedigital:{
			sdk:{
				name:'pbjs',
				version:prebid_version || '9.15.0',
			}
		}
	};

	//delete ortb.regs;
	//delete ortb.user;
	//delete ortb.source.ext;

	try
	{
		//performance.mark('lucead-improve-start');

		let res=await fetchWithTimeout(endpoint_url,{
			method:'POST',
			contentType:'text/plain',
			body:JSON.stringify(payload),
		});

		if(res.status!==200)
			return null;

		res=await res.json();

		if(enable_cookie_sync && res.ext?.improvedigital?.sync)
		{
			for(const url of res.ext.improvedigital?.sync)
				(new Image()).src=url;
		}

		if(!res?.seatbid || !res?.seatbid[0]?.bid[0]?.price)
			return null;

		res=get_seatbid(res,'improve',placement_id);

		return res;
	}
	catch(e)
	{
		console.error(e);
		return null;
	}
}

//grid
async function get_grid_bid({
	placement_id,
	ssp_placement_id,
	//deepSetValue,
	data,
	bidRequest,
})
{
	const endpoint_url=is_mock ?
		'?mock=grid' :
		'https://grid.bidswitch.net/hbjson';

	let payload=get_ortb_data(data,bidRequest);
	payload.imp[0].tagid=ssp_placement_id.toString();

	delete payload.source.ext.schain;

	try
	{
		let res=await fetchWithTimeout(endpoint_url,{
			method:'POST',
			contentType:'text/plain',
			body:JSON.stringify(payload),
		});

		if(res.status!==200)
		{
			log('Grid response not ok',res);
			return null;
		}

		res=await res.json();
		return get_seatbid(res,'grid',placement_id);
	}
	catch(e)
	{
		console.error(e);
		return null;
	}
}

//criteo
async function get_criteo_bid({
	placement_id,
	ssp_placement_id,
	data,
	bidRequest,
	prebid_version,
	deepSetValue,
})
{
	const parts=ssp_placement_id.toString().split(':');
	const ADAPTER_VERSION=37;
	const PROFILE_ID_INLINE=207;
	let url=`https://grid-bidder.criteo.com/openrtb_2_5/pbjs/auction/request?profileId=${PROFILE_ID_INLINE}&av=${String(ADAPTER_VERSION)}&wv=${encodeURIComponent(prebid_version || '9.15.0')}&cb=${String(Math.floor(Math.random()*99999999999))}&lsavail=1&networkId=${parts[0]}`;

	if(location.hash.includes('lucead-debug'))
		url+='&debug=1';

	let request=get_ortb_data(data,bidRequest);
	//payload.imp[0].tagid=placement_id.toString();
	request.imp[0].tagid=bidRequest.adUnitCode;
	delete request.imp[0].banner.w;
	delete request.imp[0].banner.h;
	request.imp[0].ext.bidder={
		publishersubid:placement_id,
		//uid:placement_id,
	};
	if(request.device.sua)
	{
		//request.device.ext.sua=request.device.sua;
		deepSetValue(request,'device.ext.sua',request.device.sua);
		delete request.device.sua;
	}


	if(parts[1])
		deepSetValue(request,'site.publisher.id',parts[1]);

	try
	{
		let res=await fetchWithTimeout(url,{
			method:'POST',
			contentType:'text/plain',
			body:JSON.stringify(request),
		});

		if(res.status!==200)
		{
			log('Criteo response not ok',res);
			return null;
		}

		res=await res.json();
		return get_seatbid(res,'criteo',placement_id);
	}
	catch(e)
	{
		console.error(e);
		return null;
	}
}

//unruly
async function get_unruly_bid({
	ssp_placement_id,
	data,
	bidRequest,
})
{
	//const parts=ssp_placement_id.toString().split(':');
	const url='https://targeting.unrulymedia.com/unruly_prebid';
	let req={...data.bidderRequest};
	req.bids=[bidRequest];
	req.bids[0].params.endpoint={siteId:parseint(ssp_placement_id)}

	try
	{
		let res=await fetchWithTimeout(url,{method:'POST',contentType:'text/plain',body:JSON.stringify({bidderRequest:req})});

		if(res.status!==200)
		{
			log('Criteo response not ok',res);
			return null;
		}

		res=await res.json();
		return res.bids[0];

	}
	catch(e)
	{
		console.error(e);
		return null;
	}
}

async function get_smart_bid({
	ssp_placement_id,
	sizes,
	size,
	prebid_version,
	transaction_id,
	bid_id,
	ad_unit_code,
	consent,
})
{
	const endpoint_url='https://prg.smartadserver.com/prebid/v1';
	//const endpoint_url='https://www14.smartadserver.com/prebid/v1';
	const ids=ssp_placement_id.toString().split(':').map(id=>parseInt(id));
	if(ids.length<3) return null;

	const payload={
		siteid:ids[0] || 351627,
		pageid:ids[1] || 1232283,
		formatid:ids[2] || 88269,
		ckid:ids[3] || 0,
		tagId:ad_unit_code,
		pageDomain:location.href,
		transactionId:transaction_id,
		timeout:3000,
		bidId:bid_id,
		prebidVersion:prebid_version || '8.37.0',
		schain:get_schain(),
		gpid:ad_unit_code,
		sizes:sizes.map(s=>({w:s[0],h:s[1]})),
		//sizes:[{w:size.width,h:size.height}],
		bidfloor:0,
		gdpr_consent:consent?.tcString || null,
	};

	try
	{
		let res=await fetchWithTimeout(endpoint_url,{
			method:'POST',
			contentType:'text/plain',
			body:JSON.stringify(payload),
		});

		if(!res.ok || res.status!==200 || res.headers.get('content-length')==='0')
		{
			log('Response not ok',res);
			return null;
		}

		res= await res.json();
		if(!res) return null;

		return {
			cpm:res?.cpm || 0,
			currency:res?.currency || 'USD',
			ad:res?.ad ? embed_html(res.ad) : null,
			size:{
				width:res.width || size.width,
				height:res.height || size.height,
			},
			ssp:'smart',
		};
	}
	catch(e)
	{
		console.error(e);
		return null;
	}
}

async function get_pubmatic_bid({
	placement_id,
	ssp_placement_id,
	data,
	bidRequest,
})
{
	const endpoint_url=is_mock ? '?mock=pubmatic':'https://hbopenbid.pubmatic.com/translator?source=prebid-client';
	const [publisher_id,ad_slot]=ssp_placement_id.toString().split(':');
	let payload=get_ortb_data(data,bidRequest);
	payload.at=1;
	payload.cur=['USD'];
	payload.imp[0].tagid=ad_slot;
	payload.imp[0].secure=1;
	payload.imp[0].banner.pos='0';
	payload.site.publisher.id=publisher_id;

	try
	{
		let res=await fetchWithTimeout(endpoint_url,{
			method:'POST',
			contentType:'text/plain',
			body:JSON.stringify(payload),
		});

		if(!res.ok)
		{
			log('Response not ok',res);
			return null;
		}

		res=await res.json();
		return get_seatbid(res,'pubmatic',placement_id);
	}
	catch(e)
	{
		console.error(e);
		return null;
	}
}

async function get_magnite_bid({
	placement_id,
	ssp_placement_id,
	ad_unit_code,
	data,
	bidRequest,
})
{
	const endpoint_url=is_mock ? '?mock=magnite' : 'https://prebid-server.rubiconproject.com/openrtb2/auction';
	const ids=ssp_placement_id.toString().split(':').map(id=>parseInt(id));
	if(ids.length<3) return null;
	let payload=get_ortb_data(data,bidRequest);
	payload.imp[0].ext.prebid={
		bidder:{
			rubicon:{
				video:{},
				accountId:ids[0],
				siteId:ids[1],
				zoneId:ids[2],
			},
		},
		adunitcode:ad_unit_code,
	};

	try
	{
		let res=await fetchWithTimeout(endpoint_url,{
			method:'POST',
			contentType:'text/plain',
			body:JSON.stringify(payload),
		});

		if(!res.ok)
			return null;

		res=await res.json();
		return get_seatbid(res,'magnite',placement_id);
	}
	catch(e)
	{
		console.error(e);
		return null;
	}
}

function prefetch_bids()
{

}

function run()
{
	storage.set_key('lucead');

	if(window.lucead_prebid_data)
	{
		lucead_prebid(window.lucead_prebid_data);
	}

	window.ayads_prebid=lucead_prebid;
	window.lucead_prebid=lucead_prebid;
	window.lucead_version=version;

	if(is_dev)
	{
		window.lucead_request_id=uniqid();
		prefetch_bids();
	}
}

//if(location.hostname.includes('24h.com.vn'))
run();
