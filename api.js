
const HDWalletProvider = require('@truffle/hdwallet-provider');
const Web3 = require("web3");
const request = require("request-promise");
const {getStatus, getEndpoint} = require("@orbs-network/orbs-nebula/lib/metrics");

const mnemonic = "a47468deab664d3ba2aec1db6787ce84";
const provider = new HDWalletProvider(mnemonic, `http://eth.orbs.com`, 0, 25);
const web3 = new Web3(provider);

const mainnetTopologyContractAddress = "0x804c8336846d8206c95CEe24752D514210B5a240";
const topologyContractAbi = require("./build/contracts/OrbsValidators");

const mainnetValidatorRegistryContractAddress = "0x56A6895FD37f358c17cbb3F14A864ea5Fe871F0a";
const validatorRegistryContractAbi = require("./build/contracts/OrbsValidatorRegistry");

const topologyContract = new web3.eth.Contract(topologyContractAbi, mainnetTopologyContractAddress);
const validatorRegistry = new web3.eth.Contract(validatorRegistryContractAbi, mainnetValidatorRegistryContractAddress);

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
        status: status.data,
    }
}


async function getValidatorData(address) {
    const ethAddress = await validatorRegistry.methods.lookupByOrbsAddr(address).call();
    const validatorData = await validatorRegistry.methods.getValidatorData(ethAddress).call();
    return validatorData;

}

async function queryActiveVChains() {
    const centralizedConfig = await getConfig("http://orbs-bootstrap-prod.s3.us-east-1.amazonaws.com/boyar/config.json");
    return centralizedConfig.chains.filter(vchain => !vchain.Disabled).map(vchain => vchain.Id);
}

async function queryTopology() {
    const topology = await topologyContract.methods.getNetworkTopology().call();
    const ips = topology.ipAddresses.map(hexStringToIPAddress);
    const addresses = topology.nodeAddresses;
    return {ips, addresses};
}

function queryValidatorStatuses(vchains, ips, addresses) {
    const statuses = [];
    vchains.forEach(vchain => {
        ips.forEach((ip, i) => {
            statuses.push(getStatusFor(addresses[i], ip, vchain));
        });
    });
    return Promise.all(statuses);
}

async function queryValidatorsData(addresses) {
    const validatorDataArray = await Promise.all(addresses.map(getValidatorData));
    return validatorDataArray.reduce((a, b) => (a[b.orbsAddress] = b, a), {});
}

module.exports = {
    queryActiveVChains,
    queryTopology,
    queryValidatorsData,
    queryValidatorStatuses,
    stop: function () {
        provider.engine.stop();
    }
};
