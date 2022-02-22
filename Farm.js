const http = require('http');
const https = require('https');

class Farm {
	static version = "1.0.0";
	static ERROR_CODES = {
		UNEXPECTED_ERROR: 1,
		INVALID_SHEPARD_ID: 2,
		INVALID_SHEPARD_QUERY: 3,
		INVALID_BEHBBLE_ID: 4,
		NO_QUERY_PROVIDED: 5,
		SHEPARD_NOT_FOUND: 6,
		REACHED_CAPACITY: 7,
		CUSTOM_ERROR: 8
	};

	constructor(settings={}) {
		this.port = settings.port || 8080;
		this.server = settings.httpsOptions ? (
			https.createServer(settings.httpsOptions)
		) : (
			http.createServer()
		);

		this.lastStatus = {
			capacity: 0,
			...(settings.status || {})
		};

		this.settings = {
			maxQueryLength: settings.maxQueryLength || 256
		};
	}

	async init() {
		await this.status();

		this.server.on('request', async (request, response) => {
			const { headers, method, url, body } = await recieveRequestData(request);
			const baseSettings = {request, response};

			const sendResponse = json => response.end(JSON.stringify(json));

			response.setHeader('Content-Type', 'application/json');
			response.setHeader('Access-Control-Allow-Origin', '*');
			response.setHeader('Access-Control-Request-Method', '*');
			response.setHeader('Access-Control-Allow-Methods', 'GET, POST');
			response.setHeader('Access-Control-Allow-Headers', '*');

			if(url === "/info") {
				sendResponse({
					is_farm: true,
					name: "Untitled Farm",
					description: "A quiet farm...",
					version: this.version,
					...(await this.info() || {})
				});
			} else if(url === "/status") {
				const status = {
					capacity: 0,
					...(await this.status() || {})
				};

				this.lastStatus = status;

				sendResponse(status);
			} else if(url === "/call_shepard" && method === "POST") {
				let farm_query = body.query;
				if(typeof farm_query === "undefined") return sendResponse({
					err: "A Shepard Query could not be found",
					code: Farm.ERROR_CODES.NO_QUERY_PROVIDED
				});

				farm_query = String(farm_query).slice(0, this.settings.maxQueryLength);

				const shepardResponse = await this.callShepard(farm_query, {
					...baseSettings,
					isChoice: !!body.isChoice
				}).catch(err => {
					return {
						err: err.toString(),
						code: Farm.ERROR_CODES.UNEXPECTED_ERROR
					};
				});

				if(!shepardResponse) return sendResponse({
					err: "Invalid Shepard Query",
					code: Farm.ERROR_CODES.INVALID_SHEPARD_QUERY
				});
				if(shepardResponse.err) {
					return sendResponse({
						err: shepardResponse.err,
						code: shepardResponse.code || Farm.ERROR_CODES.CUSTOM_ERROR
					});
				}

				const jsonRes = typeof shepardResponse.choices !== "undefined" ? ({
					success: true,
					choices: shepardResponse.choices
				}) : ({
					success: true,
					shepard: shepardResponse.id
				});

				sendResponse(jsonRes);
			} else if(url.startsWith("/shepard")) {
				const shepardID = url.split('/')[2];

				if(!shepardID) return sendResponse({
					err: "Invalid Shepard ID",
					code: Farm.ERROR_CODES.INVALID_SHEPARD_ID
				});

				const behbbles = await this.getShepardBehbbles(shepardID, baseSettings).catch(err => {
					return {
						err: err.toString(),
						code: Farm.ERROR_CODES.UNEXPECTED_ERROR
					};
				});

				if(!behbbles) return sendResponse({
					err: "Invalid Shepard ID",
					code: Farm.ERROR_CODES.INVALID_SHEPARD_ID
				});
				if(behbbles.err) {
					return sendResponse({
						err: behbbles.err,
						code: behbbles.code || Farm.ERROR_CODES.CUSTOM_ERROR
					});
				}

				sendResponse({
					behbbles: behbbles
				});
			} else if(url.startsWith("/behbble")) {
				const urlPath = url.split('/');
				const shepardID = urlPath[2];
				const behbbleID = urlPath[3];

				if(!shepardID) return sendResponse({
					err: "Invalid Shepard ID",
					code: Farm.ERROR_CODES.INVALID_SHEPARD_ID
				});

				if(!behbbleID) return sendResponse({
					err: "Invalid Behbble ID",
					code: Farm.ERROR_CODES.INVALID_BEHBBLE_ID
				});

				const behbble = await this.getBehbble(shepardID, behbbleID, baseSettings).catch(err => {
					return {
						err: err.toString(),
						code: Farm.ERROR_CODES.UNEXPECTED_ERROR
					};
				});

				if(!behbble) return sendResponse({
					err: "Invalid Shepard ID",
					code: Farm.ERROR_CODES.INVALID_SHEPARD_ID
				});
				if(behbble.err) {
					return sendResponse({
						err: behbble.err,
						code: behbble.code || Farm.ERROR_CODES.CUSTOM_ERROR
					});
				}
			} else {
				const info = this.info();

				response.setHeader('Content-Type', 'text/plain');
				response.end(`This is a Behbble server!

Name: ${info.name}
Description: ${info.description}
`);
			}
		});

		return new Promise(resolve => {
			this.server.listen(this.port, resolve);
		});
	}

	isAtCapacity() {
		return this.lastStatus.capacity >= 1;
	}

	info() {
		return {
			name: "Untitled Farm",
			description: "A quiet farm...",
		};
	}

	status() {
		return {
			capacity: 0
		};
	}

	callShepard(query, settings) {
		return {
			id: null
		};
	}

	getShepardBehbbles(shepardID, settings) {
		return [];
	}

	getBehbble(shepardID, behbbleID, { request, response }) {

	}
}

function recieveRequestData(request) {
	return new Promise((resolve, reject) => {
		const requestData = {
			headers: request.headers,
			method: request.method,
			url: request.url
		};

		let body = [];
		request.on('error', (err) => {
			console.error(err);
			reject(err);
		}).on('data', c => body.push(c)).on('end', () => {
			requestData.body = body.length > 0 ? jsonTryParse(Buffer.concat(body).toString()) : null;

			resolve(requestData);
		});
	});
}

function jsonTryParse(data) {
	try {
		return JSON.parse(data);
	} catch(e) {
		return null;
	}
}

module.exports = Farm;