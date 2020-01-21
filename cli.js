const HDWalletProvider = require('@truffle/hdwallet-provider');
const Web3 = require("web3");
const request = require("request-promise");
const {getStatus, getEndpoint} = require("@orbs-network/orbs-nebula/lib/metrics");
const { table } = require("table");

const mnemonic = "a47468deab664d3ba2aec1db6787ce84";
const provider = new HDWalletProvider(mnemonic, `http://eth.orbs.com`, 0, 25);
const web3 = new Web3(provider);
const mainnetTopologyContractAddress = "0x804c8336846d8206c95CEe24752D514210B5a240";
const topologyContractAbi = require("./build/contracts/OrbsValidators");

function hexStringToIPAddress(str) {
    if (!str) {
        return null;
    }

    if (str.startsWith("0x")) {
        str = str.substr(2);
    }

    const a = [];
    for (let i = 0, len = str.length; i < len; i += 2) {
        a.push(parseInt(str.substr(i, 2), 16));
    }

    return a.join(".");
}

async function getConfig(endpoint) {
    try {
        const body = await request(endpoint, {
            timeout: 2000,
        });
        return JSON.parse(body)
    } catch (e) {
        // Suppressed errors
        console.error(`${e.message}: ${endpoint}`);
        return {};
    }
}

async function getStatusFor(address, ip, vchain) {
    const url = getEndpoint(ip, vchain);
    const status = await getStatus({data: url}, 1000, 40000);
    return {
        address,
        ip,
        vchain,
        status: status.data
    }
}

function reportStatus({status}) {
    const FgRed = "\x1b[31m";
    const FgGreen = "\x1b[32m";
    const Reset = "\x1b[0m";

    if (status.version) {
        const orbsColor = status.status == "red" ? FgRed : FgGreen;
        const ethColor = status.ethereum.syncStatus === "success" ? FgGreen : FgRed;
        return `${status.version}\n${orbsColor}Orbs @ ${status.blockHeight}${Reset}\n${ethColor}Eth @ ${status.ethereum.lastBlock}${Reset}`;
    } else {
        return `${FgRed}N/A${Reset}`;
    }
}

function toTable(results, vchains, ips, addresses) {
    const data = [];
    data.push(["Node Address", "IP", ...vchains]);
    ips.forEach((ip, i) => {
        const vchainStatuses = results.filter(r => r.ip === ip).map(reportStatus);
        data.push([addresses[i], ip, ...vchainStatuses]);
    });
    return table(data);
}

(async function () {
    try {
        const centralizedConfig = await getConfig("http://orbs-bootstrap-prod.s3.us-east-1.amazonaws.com/boyar/config.json");
        const vchains = centralizedConfig.chains.filter(vchain => !vchain.Disabled).map(vchain => vchain.Id);

        const topologyContract = new web3.eth.Contract(topologyContractAbi, mainnetTopologyContractAddress);
        const topology = await topologyContract.methods.getNetworkTopology().call();
        const ips = topology.ipAddresses.map(hexStringToIPAddress);
        const addresses = topology.nodeAddresses;

        const statuses = [];
        vchains.forEach(vchain => {
            ips.forEach((ip, i) => {
                statuses.push(getStatusFor(addresses[i], ip, vchain));
            });
        });

        const results = await Promise.all(statuses);
        console.log(toTable(results, vchains, ips, addresses));


    } finally {
        provider.engine.stop();
    }
})();
