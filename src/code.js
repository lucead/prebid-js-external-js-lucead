import {add_origin_trial,log} from './ayads.js';

add_origin_trial();

function embed_html(html)
{
	return `<html lang="en"><body style="margin:0">${html}</body></html>`;
}

async function get_improve_bid({ortbConverter,bidRequests,bidderRequest,getUniqueIdentifierStr,size,placement_id})
{
	const ad_id='3890677904';
	const endpoint_url=location.hash.includes('mock')?
		'?mock_improve':
		'https://ad.360yield.com/pb';
	const ortb=ortbConverter({}).toORTB({bidRequests,bidderRequest});
	ortb.imp[0].ext.bidder={placementId:placement_id||22511670};
	// noinspection JSValidateTypes
	ortb.imp[0].banner.format=[{w:size.width||300,h:size.height||250}];
	ortb.id=getUniqueIdentifierStr();
	ortb.ext={'improvedigital':{'sdk':{'name':'pbjs','version':window?.pbjs?.version||'8.32.0'}}};

	try
	{
		let res=await fetch(endpoint_url,{
			method:'POST',
			contentType:'text/plain',
			body:JSON.stringify(ortb),
		});

		if(!res.ok || res.status!==200)
			return null;

		res=await res.json();

		if(!res?.seatbid[0]?.bid[0]?.price)
			return null;

		return {
			cpm:res?.seatbid[0]?.bid[0]?.price,
			currency:res?.cur,
			ad:embed_html(res?.seatbid[0]?.bid[0]?.adm),
			ad_id:ad_id.toString(),
		};
	}
	catch(e)
	{
		debugger;
		return null;
	}
}

window.ayads_prebid=async function(data) {
	//data=data||window.ayads_prebid_data;
	log('prebid companion',data);
	const base_url=data.base_url;
	const endpoint_url=data.endpoint_url;
	const request_id=data.request_id;
	const ssps_params=await fetch(`${data.static_url}/placements/ssps_params?ids=`+data.validBidRequests.map(r=>r?.params.placementId).join(',')).then(r=>r.json());

	const responses=await Promise.all(data.validBidRequests.map(async bid=>{
		const empty_response={
			bid_id:bid.bidId,
			bid:0,
			ad:null,
			size:null,
		};

		if(bid?.params?.enableContextual===false)
		{
			return empty_response;
		}

		const size={
			width:bid.sizes[0][0] || 300,
			height:bid.sizes[0][1] || 250,
		};

		try
		{
			const auctionConfig={
				seller:base_url,
				decisionLogicUrl:`${base_url}/js/ssp.js`,
				interestGroupBuyers:[base_url],
				auctionSignals:{
					size,
				},
				sellerSignals:{},
				sellerTimeout:1000,
				sellerCurrency:'EUR',
				perBuyerSignals:{
					[base_url]:{
						prebid_bid_id:bid.bidId,
						prebid_request_id:data.bidderRequest.bidderRequestId,
					},
				},
				perBuyerTimeouts:{'*':1000},
				resolveToConfig:false,
				dataVersion:2,
			};
			const selected_ad=await navigator.runAdAuction(auctionConfig);
			log('selected_ad',selected_ad);

			if(selected_ad)
			{
				const iframe=document.createElement('iframe');//force the request to url, to trigger the report network request
				iframe.src=selected_ad;
				iframe.style.display='none';
				document.body.appendChild(iframe);
				iframe.remove();
				//css to hide iframe scrollbars: iframe{overflow:hidden}
				return {
					bid_id:bid.bidId,
					ad:embed_html(`<iframe src="${selected_ad}" style="width:${size.width}px;height:${size.height}px;border:none" seamless ></iframe>`),
					size,
				};
			}
			else
			{
				const placement_id=bid?.params?.placementId;

				if(!placement_id)
					return empty_response;

				let ssp_responses=[];
				if(ssps_params[placement_id].improve)
				{
					ssp_responses.push(get_improve_bid({
						...data,
						size,
						placement_id:ssps_params[placement_id].improve,
					}));
				}

				if(!ssp_responses.length)
					return empty_response;

				const bids=await Promise.all(ssp_responses);
				bids.sort((a,b)=>(b?.cpm||0)-(a?.cpm||0));

				if(bids[0]?.cpm)
				{
					let winner=bids[0];
					winner.bid_id=bid.bidId;
					winner.size=size;
					return winner;
				}
				else
					return empty_response;
			}
		}
		catch(e)
		{
			debugger;
			console.error(e);
			return empty_response;
		}
	}));

	fetch(`${endpoint_url}/prebid/pub`,{
		method:'POST',
		contentType:'text/plain',
		body:JSON.stringify({request_id,responses}),
	}).catch(console.error);
};

// when this script is loaded, after the adapter and LOAD_COMPANION is false
if(window.ayads_prebid_data)
{
	window.ayads_prebid(window.ayads_prebid_data);
	delete window.ayads_prebid_data;
}
