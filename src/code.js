/**
 * Clear cache : https://www.jsdelivr.com/tools/purge
 * https://cdn.jsdelivr.net/gh/lucead/prebid-js-external-js-lucead@master/dist/prod.min.js
 * https://raw.githubusercontent.com/lucead/prebid-js-external-js-lucead/master/dist/prod.min.js
 *
 * ORTB Docs: https://publisher.docs.themediagrid.com/grid/buyer-ortb-protocol/source.html#source-object
 * https://weqyoua.info/
 * https://www.sanook.com/
 */

import {log,error} from './ayads.js';
import * as storage from './storage.js';

const version='v0511.1';
const fetch_timeout=1500; //individual fetch timemout
const prerender_pa=true; // to trigger win report
const enable_sr=true;
//const stored_response_prefix='response';

function get_stored_response_key(placement_id)
{
	return 'response-'+placement_id;
}

function add_tag()
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
	document.body.appendChild(iframe);*/
}

//setTimeout(cookiematch,1000);

/*function measure_features_support(base_url)
{
	//debugger;
	const key='lucead:features:mesured';
	if(localStorage.getItem(key)) return;
	const pa_enabled=('runAdAuction' in navigator);
	const url=`${base_url}/report/features?pa=${pa_enabled?1:0}&domain=${location.hostname}`;
	const iframe=document.createElement('iframe');
	iframe.id='lucead-measure-features';
	iframe.src=url;
	iframe.style.display='none';
	document.body.appendChild(iframe);
	localStorage.setItem(key,'1');
}*/

async function fetchWithTimeout(resource,options={})
{
	const {timeout=fetch_timeout}=options;

	const controller=new AbortController();
	const id=setTimeout(()=>controller.abort(),timeout);

	const response=await fetch(resource,{
		...options,
		signal:controller.signal,
		credentials:'include',
	});

	clearTimeout(id);
	return response;
}

function embed_html(html)
{
	if(!html)
		return null;

	if(html.includes('<html'))
		return html;

	return `<html lang="en"><body style="margin:0;background-color:#FFF">${html}</body></html>`;
}

function get_ortb_data(data,bidRequest)
{
	let payload=data.ortbConverter({}).toORTB({bidRequests:[bidRequest],bidderRequest:data.bidderRequest});

	if(data.consent)
	{
		data.deepSetValue(payload,'user.ext.consent',data?.consent?.tcString);
		data.deepSetValue(payload,'regs.ext.gdpr',data?.consent?.gdprApplies ? 1 : 0);
	}
	else
		data.deepSetValue(payload,'regs.ext.gdpr',0);

	if(payload.imp?.length)
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

	data.deepSetValue(payload,'device.js',1);
	data.deepSetValue(payload,'at',1);
	data.deepSetValue(payload,'cur',['USD']);

	return payload;
};

function get_seatbid(result,size,ssp=null)
{
	if(!result?.seatbid?.length)
		return null;

	let bids=result.seatbid[0].bid.filter(b=>b && b.price>0 && b.adm && b.w===size.width && b.h===size.height);
	bids.sort((a,b)=>b.price-a.price);

	let bid=bids[0];

	return {
		cpm:bid?.price || 0,
		currency:result.cur||'USD',
		ad:embed_html(bid?.adm || null),
		size:{
			width:bid?.w || size.width,
			height:bid?.h || size.height,
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

async function get_placements_info(data)
{
	try
	{
		return await fetch(`${data.static_url}/placements/info?ids=`+data.bidRequests.map(r=>r?.params.placementId).join(',')).then(r=>r.json());
	}
	catch(e)
	{
		return null;
	}
}

async function get_pa_bid({lb_url,base_url,size,placement_id,bidRequest,bidderRequest,floor,is_sra,endpoint_url})
{
	size||={width:300,height:250};
	const ig_owner=base_url;

	const auctionConfig={
		seller:ig_owner,
		decisionLogicUrl:`${ig_owner}/js/ssp.js`,
		interestGroupBuyers:[ig_owner],
		auctionSignals:{
			size,
			placement_id,
		},
		requestedSize:size,
		allSlotsRequestedSizes:[size],
		sellerSignals:{},
		sellerTimeout:1000,
		sellerCurrency:'EUR',
		//deprecatedRenderURLReplacements:{'${AD_WIDTH}':'300','%%SELLER_ALT%%':'exampleSSP'},
		perBuyerSignals:{
			[ig_owner]:{
				prebid_bid_id:bidRequest?.bidId,
				prebid_request_id:bidderRequest?.bidderRequestId,
				placement_id,
				floor,
				is_sra,
				endpoint_url,
			},
		},
		perBuyerTimeouts:{'*':1000},
		resolveToConfig:false,
		dataVersion:2,
		deprecatedReplaceInURN:{'${PLACEMENT_ID}':placement_id},// needs FLAG FledgeDeprecatedRenderURLReplacements
	};

	let selected_ad;

	if(!navigator.runAdAuction || location.hash.includes('skip-pa'))
		selected_ad=null;
	else
	{
		selected_ad=await navigator.runAdAuction(auctionConfig);
		await navigator.deprecatedReplaceInURN(selected_ad,{'${PLACEMENT_ID}':placement_id});
	}

	//debugger;
	//log('PAAPI',placement_id,selected_ad);

	if(selected_ad)
	{
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
		return {
			bid_id:bidRequest?.bidId,
			ad:embed_html(`<iframe src="${selected_ad}" style="width:${size.width}px;height:${size.height}px;border:none" seamless ></iframe>`),
			size,
			is_pa:true,
			placement_id,
		};
	}
	else
		return null;
}

async function get_all_responses(data)
{
	const placements_info=data.placements_info;

	return await Promise.all(data.bidRequests.map(async bidRequest=>{
		const empty_response={
			bid_id:bidRequest?.bidId,
			bid:0,
			ad:null,
			size:null,
			placement_id:data.placement_id,
		};

		if(bidRequest?.params?.enableContextual===false)
		{
			return empty_response;
		}

		const size={
			width:bidRequest.sizes[0][0] || 300,
			height:bidRequest.sizes[0][1] || 250,
		};

		try
		{
			const placement_id=bidRequest?.params?.placementId;

			if(!placement_id)
				return empty_response;

			const pa_response=await get_pa_bid({
				...data,
				size,
				placement_id,
				data,
				bidRequest,
			});

			if(pa_response)
				return pa_response;

			const placement=placements_info[placement_id]||null;

			if(!placement?.ssps)
			{
				log('No placement info',placement_id,placements_info);
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
					size,
					placement_id:placement?.ssps?.improve,
					data,
					bidRequest,
				}));
			}

			if(placement?.ssps?.grid)
			{
				ssp_responses.push(get_grid_bid({
					...data,
					size,
					placement_id:placement?.ssps.grid,
					deepSetValue:data.deepSetValue,
					data,
					bidRequest,
				}));
			}

			if(placement?.ssps?.smart)
			{
				ssp_responses.push(get_smart_bid({
					...data,
					sizes:bidRequest.sizes,
					size,
					placement_id:placement?.ssps?.smart,
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
					size,
					placement_id:placement?.ssps?.pubmatic,
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
					size,
					placement_id:placement?.ssps?.magnite,
					ad_unit_code:bidRequest.adUnitCode,
					data,
					bidRequest,
					placement,
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

				//send_log(winner);

				winner.bid_id=bidRequest.bidId;
				winner.size=size;
				winner.placement_id=placement_id;

				if(enable_sr)
				{
					const markup=`<script>top.ayads_rendered("${placement_id}")</script>`;

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
	//log('Lucead for Prebid ',version,data);
	const endpoint_url=data.endpoint_url.replace('/go','');
	const request_id=data.request_id;
	const [placements_info,consent]=await Promise.all([get_placements_info(data),get_gdpr()]);
	data.consent=consent;
	data.placements_info=placements_info;
	performance.mark('lucead-start');

	let responses=null;

	try
	{
		responses=await get_all_responses(data);
	}
	catch(e)
	{
		error(e);
	}

	performance.mark('lucead-end');
	log(version,responses,performance.measure('lucead-all-responses','lucead-start','lucead-end'));

	fetch(`${endpoint_url}/go/prebid/pub`,{
		method:'POST',
		contentType:'text/plain',
		body:JSON.stringify({
			request_id,
			responses,
			is_sra:data.is_sra,
		}),
	}).catch(error);

	//measure_features_support(data.base_url);
};

window.ayads_rendered=function(placement_id) {
	const key=get_stored_response_key(placement_id);
	log('rendered',placement_id,storage.get(key));
	storage.remove(key);
};

const is_mock=location.hash.includes('mock');

async function get_improve_bid({
	data,
	bidRequest,
	prebid_version,
	size,
	placement_id,
})
{
	const endpoint_url=is_mock ?
		'?mock=improve' :
		'https://ad.360yield.com/pb';
	const ortb=get_ortb_data(data,bidRequest);

	ortb.imp[0].ext.bidder={placementId:placement_id || 22511670};
	// noinspection JSValidateTypes
	//ortb.imp[0].banner.format=[{w:size.width||300,h:size.height||250}];
	//ortb.id=getUniqueIdentifierStr();
	ortb.ext={'improvedigital':{'sdk':{'name':'pbjs','version':prebid_version || '8.32.0'}}};

	try
	{
		performance.mark('lucead-improve-start');
		let res=await fetchWithTimeout(endpoint_url,{
			method:'POST',
			contentType:'text/plain',
			body:JSON.stringify(ortb),
		});

		if(res.status!==200)
			return null;

		res= await res.json();

		if(!res?.seatbid[0]?.bid[0]?.price)
			return null;

		performance.mark('lucead-improve-end');
		return get_seatbid(res,size,'improve');
	}
	catch(e)
	{
		return null;
	}
}

//grid
async function get_grid_bid({
	size,
	placement_id,
	//deepSetValue,
	data,
	bidRequest,
})
{
	const endpoint_url=is_mock ?
		'?mock=grid' :
		'https://grid.bidswitch.net/hbjson';

	let payload=get_ortb_data(data,bidRequest);
	payload.imp[0].tagid=placement_id.toString();
	//payload.imp[0].banner.format=[{w:size.width||300,h:size.height||250}];
	/*deepSetValue(payload,'source.ext.shain',{
		ver:'1.0',
		complete:1,
		nodes:[
			{
				'asi':location.hostname,
				'sid':'eebc0afdab1a294da19d3c6e81f17cba',
				'hp':1,
			},
		],
	});*/

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
		return get_seatbid(res,size,'grid');
	}
	catch(e)
	{
		return null;
	}
}

async function get_smart_bid({
	placement_id,
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
	const ids=placement_id.toString().split(':').map(id=>parseInt(id));
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
		schain:pbjs.getConfig('schain'),
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
		return null;
	}
}

async function get_pubmatic_bid({
	placement_id,
	size,
	data,
	bidRequest,
})
{
	const endpoint_url=is_mock ? '?mock=pubmatic':'https://hbopenbid.pubmatic.com/translator?source=prebid-client';
	const [publisher_id,ad_slot]=placement_id.toString().split(':');
	let payload=get_ortb_data(data,bidRequest);
	payload.at=1;
	payload.cur=['USD'];
	payload.imp[0].tagid=ad_slot;
	payload.imp[0].secure=1;
	payload.imp[0].banner.pos=0;
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
		return get_seatbid(res,size,'pubmatic');
	}
	catch(e)
	{
		return null;
	}
}

async function get_magnite_bid({
	placement_id,
	size,
	ad_unit_code,
	data,
	bidRequest,
	placement,
})
{
	const endpoint_url=is_mock ? '?mock=magnite' : 'https://prebid-server.rubiconproject.com/openrtb2/auction';
	const ids=placement_id.toString().split(':').map(id=>parseInt(id));
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
		return get_seatbid(res,size,'magnite',placement);
	}
	catch(e)
	{
		return null;
	}
}

storage.set_key('lucead');
window.ayads_prebid=lucead_prebid;
window.lucead_prebid=lucead_prebid;

//if(location.hostname==='www.24h.com.vn')add_tag();
