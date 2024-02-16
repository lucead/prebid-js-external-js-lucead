export function log()
{
	console.log('%c.io','background:#444;color:#fd890d;border-radius:4px;padding:2px',...arguments);
	//console.log('[Ayads]',...arguments);
}

export function process_queue()
{
	let q=window?.ayads_q;

	if(q?.length)
	{
		for(const f of q)
			f.call(ayads);
	}

	q={push:f=>f.call(this)};
	window.ayads_q=q;
}

export function add_origin_trial()
{
	const tokens=[
		'A7NuR1g6wYzd9WyYOzQ+OGtHunaTZ4cFvdcU8i8AMW67fOhUNyV65oDgGd+tP/6EfIxYbe/faGGUkeQ5Mhh3WwAAAABzeyJvcmlnaW4iOiJodHRwczovL2F5YWRzLmlvOjQ0MyIsImZlYXR1cmUiOiJGbGVkZ2VCaWRkaW5nQW5kQXVjdGlvblNlcnZlciIsImV4cGlyeSI6MTcxOTM1OTk5OSwiaXNUaGlyZFBhcnR5Ijp0cnVlfQ==',//protected audience ayads.io
		//'A0ayCzp5tMO+uRtpVHysiGBsHRMZlFkiVtslzlLSuZ0BJAKIYmkRdra7m9zeQzJrMeVowSSKTsDZZO+xpZIJjQoAAACkeyJvcmlnaW4iOiJodHRwczovL2Q0M2YtMmEwMi04NDI5LWU0YTAtMTcwMS00Y2EtZjQzNi04ZjctYjBjYS5uZ3Jvay1mcmVlLmFwcDo0NDMiLCJmZWF0dXJlIjoiRmxlZGdlQmlkZGluZ0FuZEF1Y3Rpb25TZXJ2ZXIiLCJleHBpcnkiOjE3MTkzNTk5OTksImlzVGhpcmRQYXJ0eSI6dHJ1ZX0=',//PA d43f-2a02-8429-e4a0-1701-4ca-f436-8f7-b0ca.ngrok-free.app
		//'A6z2fbxFmuk+VI/nWJrOuGAOI7kk7nFS+Y6g4BNaNO9aN/dXTyO3CjYsN9bTwfUi/ebN1e0WCwIhbkgEVauh1wUAAABneyJvcmlnaW4iOiJodHRwczovL290LTNwLXNyYy5nbGl0Y2gubWU6NDQzIiwiZmVhdHVyZSI6IldlYlNRTCIsImV4cGlyeSI6MTcxNjk0MDc5OSwiaXNUaGlyZFBhcnR5Ijp0cnVlfQ==',//https://ot-3p.glitch.me/ example
	];

	for(const token of tokens)
	{
		const meta=document.createElement('meta');
		meta.httpEquiv='origin-trial';
		meta.content=token;
		document.head.appendChild(meta);
		log('Origin trial added',decode_token(token));
	}
}

function base64decode(str)
{
	return new Uint8Array([...atob(str)].map(a=>a.charCodeAt(0)));
}

function decode_token(token)
{
	const buf=base64decode(token);
	const view=new DataView(buf.buffer);
	const version=view.getUint8();
	const signature=buf.slice(1,65);
	const length=view.getUint32(65,false);
	const payload=JSON.parse((new TextDecoder()).decode(buf.slice(69,69+length)));
	return {payload,version,length,signature};
}

export const storage={
	key:'storage',
	get_all:function(){
		let values=this.get_values();
		let res={};
		for(let key in values)
		{ // noinspection JSUnfilteredForInLoop
			res[key]=values[key][0];
		}
		return res;
	},
	get_values:function(){
		let values=JSON.parse(localStorage.getItem(this.key)) || {};

		for(let i in values)
		{
			if(values.hasOwnProperty(i))
			{
				let expire=values[i][1] || 0;
				if(expire && expire<this.time())
				{
					delete values[i];
					this.set(i,null);
				}
			}
		}

		return values;
	},
	xhr_setup:function(xhr){
		let values=this.get_values();
		let res=[];
		for(let key in values)
			if(values.hasOwnProperty(key))
				res.push(key+'='+encodeURIComponent(values[key][0]));
		xhr.setRequestHeader('X-Storage',res.join('&'));

		if(values.sessid)
			xhr.setRequestHeader('X-Sessid',values.sessid[0]);
	},
	xhr_handle_response:function(xhr) {
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
						this.set(data[0],data[1],data[2]);
				});
			}
		}
		catch(e)
		{
			console.log('xhr handle response error',e);
		}
	},
	get:function(k){
		let values=this.get_values();
		return (values[k] && values[k][0])||null;
	},
	set:function(k,v,ttl=0,expires=0) {
		let values=JSON.parse(localStorage.getItem(this.key)) || {};

		if(ttl && !expires)
			expires=this.time()+ttl;

		if(v)
			values[k]=[v,expires];
		else
			delete values[k];

		localStorage.setItem(this.key,JSON.stringify(values));
		this.clean_expired();
	},
	delete:function(k){
		this.set(k,null);
	},
	time:function(){
		return Math.floor(Date.now()/1000);
	},
	clean_expired:function() {
		let values=JSON.parse(localStorage.getItem(this.key));
		for(let i in values)
		{
			if(values.hasOwnProperty(i))
			{
				let expire=values[i][1] || 0;
				if(expire && expire<this.time()) delete values[i];
			}
		}

		localStorage.setItem(this.key,JSON.stringify(values));
	},
	set_cookie:function(cname,cvalue,ttl){
		let date=new Date();
		date.setTime(date.getTime()+(ttl*1000));
		let expires='expires='+date.toUTCString();
		document.cookie=cname+'='+cvalue+'; '+expires+'; path=/';
	},
};
