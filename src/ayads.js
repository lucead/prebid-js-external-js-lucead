export function log()
{
	console.log('%cLucead','background:#444;color:#4EA05D;border-radius:4px;padding:2px',...arguments);
}

export function error()
{
	console.error('%cLucead','background:#444;color:#4EA05D;border-radius:4px;padding:2px',...arguments);
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
