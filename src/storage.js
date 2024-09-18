export let key='storage';

export function set_key(k)
{
	key=k;
}

export function get_all()
{
	let values=get_values();
	let res={};
	for(let key in values)
	{ // noinspection JSUnfilteredForInLoop
		res[key]=values[key][0];
	}
	return res;
}

export function get_values()
{
	let values=JSON.parse(localStorage.getItem(key)) || {};

	for(let i in values)
	{
		if(values.hasOwnProperty(i))
		{
			let expire=values[i][1] || 0;
			if(expire && expire<time())
			{
				delete values[i];
				set(i,null);
			}
		}
	}

	return values;
}

export function xhr_setup(xhr)
{
	let values=get_values();
	let res=[];
	for(let key in values)
		if(values.hasOwnProperty(key))
			res.push(key+'='+encodeURIComponent(values[key][0]));
	xhr.setRequestHeader('X-Storage',res.join('&'));

	if(values.sessid)
		xhr.setRequestHeader('X-Sessid',values.sessid[0]);
}

export function xhr_handle_response(xhr)
{
	try
	{
		let headers=null;

		if(xhr.getAllResponseHeaders().toLowerCase().includes('x-storage')>=0)
		{
			headers=xhr.getResponseHeader('x-storage');
		}

		if(headers)
		{
			headers.split(', ').map(JSON.parse).forEach((data)=>{
				if(data && data.length)
					set(data[0],data[1],data[2]);
			});
		}
	}
	catch(e)
	{
		console.log('xhr handle response error',e);
	}
}

export function get(k)
{
	let values=get_values();
	//debugger;
	return (values[k] && values[k][0]) || null;
}

export function set(k,v,ttl)
{
	let values=JSON.parse(localStorage.getItem(key)) || {};

	if(v)
		values[k]=[v,ttl ? time()+ttl : 0];
	else
		delete values[k];

	localStorage.setItem(key,JSON.stringify(values));
	clean_expired();
}

export function remove(k)
{
	set(k,null);
}

export function time()
{
	return Math.floor(Date.now()/1000);
}

export function clean_expired()
{
	let values=JSON.parse(localStorage.getItem(key));
	for(let i in values)
	{
		if(values.hasOwnProperty(i))
		{
			let expire=values[i][1] || 0;
			if(expire && expire<time()) delete values[i];
		}
	}

	localStorage.setItem(key,JSON.stringify(values));
}

export function set_cookie(cname,cvalue,ttl)
{
	let date=new Date();
	date.setTime(date.getTime()+(ttl*1000));
	let expires='expires='+date.toUTCString();
	document.cookie=cname+'='+cvalue+'; '+expires+'; path=/';
}
