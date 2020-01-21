
const HDWalletProvider = require('@truffle/hdwallet-provider');
const Web3 = require("web3");
const request = require("request-promise");
const orbs = require("@orbs-network/orbs-nebula/lib/metrics");

const provider = new HDWalletProvider("a47468deab664d3ba2aec1db6787ce84", `http://eth.orbs.com`, 0, 25);
const web3 = new Web3(provider);

const mainnetTopologyContractAddress = "0x804c8336846d8206c95CEe24752D514210B5a240";
const topologyContractAbi = require("./build/contracts/OrbsValidators");

const mainnetValidatorRegistryContractAddress = "0x56A6895FD37f358c17cbb3F14A864ea5Fe871F0a";
const validatorRegistryContractAbi = require("./build/contracts/OrbsValidatorRegistry");

class StatusCollector {
    constructor(provider) {
        this.provider = provider;
        this.web3 = new Web3(provider);
        this.topologyContract = new web3.eth.Contract(topologyContractAbi, mainnetTopologyContractAddress);
        this.validatorRegistry = new web3.eth.Contract(validatorRegistryContractAbi, mainnetValidatorRegistryContractAddress);
    }

    async getValidatorData(address) {
        const ethAddress = await this.validatorRegistry.methods.lookupByOrbsAddr(address).call();
        return await this.validatorRegistry.methods.getValidatorData(ethAddress).call();
    }

    async queryTopology() {
        const topology = await this.topologyContract.methods.getNetworkTopology().call();
        const ips = topology.ipAddresses.map(hexStringToIPAddress);
        const addresses = topology.nodeAddresses;
        return {ips, addresses};
    }

    queryValidatorStatuses(vchains, ips, addresses) {
        const statuses = [];
        vchains.forEach(vchain => {
            ips.forEach((ip, i) => {
                statuses.push(getStatusFor(addresses[i], ip, vchain));
            });
        });
        return Promise.all(statuses);
    }

    async queryValidatorsData(addresses) {
        const validatorDataArray = await Promise.all(addresses.map(this.getValidatorData.bind(this)));
        return validatorDataArray.reduce((a, b) => (a[b.orbsAddress] = b, a), {});
    }


    async queryActiveVChains() {
        const centralizedConfig = await getConfig("http://orbs-bootstrap-prod.s3.us-east-1.amazonaws.com/boyar/config.json");
        return centralizedConfig.chains.filter(vchain => !vchain.Disabled).map(vchain => vchain.Id);
    }

}

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
    const url = orbs.getEndpoint(ip, vchain);
    const status = await orbs.getStatus({data: url}, 1000, 40000);
    return {
        address,
        ip,
        vchain,
        status: status.data,
    }
}


module.exports = {
    StatusCollector,
};
