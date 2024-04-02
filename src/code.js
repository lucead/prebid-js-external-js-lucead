/**
 * Clear cache : https://www.jsdelivr.com/tools/purge
 * https://cdn.jsdelivr.net/gh/lucead/prebid-js-external-js-lucead@master/dist/prod.min.js
 * https://raw.githubusercontent.com/lucead/prebid-js-external-js-lucead/master/dist/prod.min.js
 *
 * ORTB Docs: https://publisher.docs.themediagrid.com/grid/buyer-ortb-protocol/source.html#source-object
 * https://weqyoua.info/
 * https://www.sanook.com/
 */

import {log} from './ayads.js';

//add_origin_trial();
const version='v04.02.2';
const fetch_timeout=1200; //individual fetch timemout
//const all_responses_timeout=2500; //total timeout to get all bids
const prerender_pa=false; // to trigger win report

async function fetchWithTimeout(resource,options={})
{
	const {timeout=fetch_timeout}=options;

	const controller=new AbortController();
	const id=setTimeout(()=>controller.abort(),timeout);

	const response=await fetch(resource,{
		...options,
		signal:controller.signal,
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

	if(data.consent && data.deepSetValue)
	{
		data.deepSetValue(payload,'user.ext.consent',data?.consent?.tcString);
		data.deepSetValue(payload,'regs.ext.gdpr',data?.consent?.gdprApplies ? 1 : 0);
	}

	if(payload.imp?.length)
	{
		for(const imp of payload.imp)
		{
			imp.banner.w=bidRequest.sizes[0][0];
			imp.banner.h=bidRequest.sizes[0][1];
		}
	}

	return payload;
};

function get_seatbid(result,size,ssp=null)
{
	if(!result?.seatbid?.length)
		return null;

	let bids=result.seatbid[0].bid.filter(b=>b && b.price>0 && b.adm && b.w===size.width && b.h===size.height);
	bids.sort((a,b)=>b.price-a.price);

	let bid=bids[0];

	if(bid?.price)
	{
		fetch();
	}

	return {
		cpm:bid?.price || 0,
		currency:'USD',
		ad:embed_html(bid?.adm || null),
		size:{
			width:bid?.w || size.width,
			height:bid?.h || size.height,
		},
		ssp,
		adomain:bid?.adomain?.length ? bid.adomain[0] : null
	};
}

// {gdprApplies: true, tcString: '...'}
async function get_gdpr()
{
	return new Promise(resolve=>{
		if(window.__tcfapi)
		{
			window.__tcfapi('getTCData',2,(tcData,success)=>{
				resolve(success ? tcData : null);
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

async function get_pa_bid({base_url,size,placement_id,bidRequest,bidderRequest})
{
	base_url||='https://lucead.com';
	const ig_owner=base_url.endsWith('lucead.com') ? 'https://ayads.io' : base_url;

	const auctionConfig={
		seller:ig_owner,
		decisionLogicUrl:`${ig_owner}/js/ssp.js`,
		interestGroupBuyers:[ig_owner],
		auctionSignals:{
			size,
			placement_id,
		},
		sellerSignals:{},
		sellerTimeout:1000,
		sellerCurrency:'EUR',
		perBuyerSignals:{
			[ig_owner]:{
				prebid_bid_id:bidRequest.bidId,
				prebid_request_id:bidderRequest.bidderRequestId,
			},
		},
		perBuyerTimeouts:{'*':1000},
		resolveToConfig:false,
		dataVersion:2,
	};

	let selected_ad;

	if(!navigator.runAdAuction || location.hash.includes('skip-pa'))
		selected_ad=null;
	else
		selected_ad=await navigator.runAdAuction(auctionConfig);

	log('PAAPI',placement_id,selected_ad);

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
			bid_id:bidRequest.bidId,
			ad:embed_html(`<iframe src="${selected_ad}" style="width:${size.width}px;height:${size.height}px;border:none" seamless ></iframe>`),
			size,
			is_pa:true,
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
			bid_id:bidRequest.bidId,
			bid:0,
			ad:null,
			size:null,
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


			if(!placements_info[placement_id]?.ssps)
			{
				log('No placement info',placement_id,placements_info);
				return empty_response;
			}

			let ssp_responses=[];

			if(placements_info[placement_id]?.ssps?.improve)
			{
				ssp_responses.push(get_improve_bid({
					...data,
					size,
					placement_id:placements_info[placement_id]?.ssps?.improve,
					data,
					bidRequest,
				}));
			}

			if(placements_info[placement_id]?.ssps?.grid)
			{
				ssp_responses.push(get_grid_bid({
					...data,
					size,
					placement_id:placements_info[placement_id]?.ssps.grid,
					deepSetValue:data.deepSetValue,
					data,
					bidRequest,
				}));
			}

			if(placements_info[placement_id]?.ssps?.smart)
			{
				ssp_responses.push(get_smart_bid({
					...data,
					sizes:bidRequest.sizes,
					size,
					placement_id:placements_info[placement_id]?.ssps?.smart,
					transaction_id:bidRequest.transactionId,
					bid_id:bidRequest.bidId,
					ad_unit_code:bidRequest.adUnitCode,
					deepSetValue:data.deepSetValue,
					data,
					bidRequest,
				}));
			}

			if(placements_info[placement_id]?.ssps?.pubmatic)
			{
				ssp_responses.push(get_pubmatic_bid({
					...data,
					size,
					placement_id:placements_info[placement_id]?.ssps?.pubmatic,
					transaction_id:bidRequest.transactionId,
					bid_id:bidRequest.bidId,
					ad_unit_code:bidRequest.adUnitCode,
					data,
					bidRequest,
				}));
			}

			if(placements_info[placement_id]?.ssps?.magnite)
			{
				ssp_responses.push(get_magnite_bid({
					...data,
					size,
					placement_id:placements_info[placement_id]?.ssps?.magnite,
					ad_unit_code:bidRequest.adUnitCode,
					data,
					bidRequest,
				}));
			}

			if(!ssp_responses.length)
				return empty_response;

			let bids=await Promise.all(ssp_responses);
			if(bids===null || !bids?.length)
			{
				log('No bids',placement_id,bids);
				return empty_response;
			}
			bids=bids.filter(b=>b && b.cpm);

			log('SSP Bids',placement_id,bids);

			if(bids?.length)
			{
				if(!bids[0]?.is_pa)
					bids.sort((a,b)=>(b?.cpm || 0)-(a?.cpm || 0));

				let winner=bids[0];
				winner.bid_id=bidRequest.bidId;
				winner.size=size;
				return winner;
			}
			else
				return empty_response;
		}
		catch(e)
		{
			console.error(e);
			return empty_response;
		}
	}));
}

async function ayads_prebid(data)
{
	log('Lucead for Prebid '+version,data);
	const endpoint_url=data.endpoint_url;
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
		console.error(e);
	}

	performance.mark('lucead-end');

	log('All responses',responses,performance.measure('lucead-all-responses','lucead-start','lucead-end'));

	fetch(`${endpoint_url}/prebid/pub`,{
		method:'POST',
		contentType:'text/plain',
		body:JSON.stringify({request_id,responses}),
	}).catch(console.error);
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
	const endpoint_url=is_mock ? '?mock=pubmatic' : 'https://hbopenbid.pubmatic.com/translator?source=prebid-client';
	let payload=get_ortb_data(data,bidRequest);
	payload.at=1;
	payload.cur=['USD','EUR'];
	payload.imp[0].tagid=placement_id.toString();

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
		return get_seatbid(res,size,'magnite');
	}
	catch(e)
	{
		return null;
	}
}

window.ayads_prebid=ayads_prebid;

// when this script is loaded, after the adapter and LOAD_COMPANION is false
if(window.ayads_prebid_data)
{
	window.ayads_prebid(window.ayads_prebid_data);
	delete window.ayads_prebid_data;
}
