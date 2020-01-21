#!/usr/bin/env node
const { table } = require("table");
const HDWalletProvider = require('@truffle/hdwallet-provider');
const { StatusCollector } = require("./status-collector");

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

function toTable(statuses, vchains, ips, addresses, validatorsData) {
    const data = [];
    data.push(["Validator", "IP", ...vchains]);
    ips.forEach((ip, i) => {
        const vchainStatuses = statuses.filter(r => r.ip === ip).map(reportStatus);
        const validatorData = validatorsData[addresses[i]];
        const validatorDescription = `${validatorData.name}\nNode Address: ${validatorData.orbsAddress}\n${validatorData.website}`;
        data.push([validatorDescription, ip, ...vchainStatuses]);
    });
    return table(data);
}

(async function () {
    const provider = new HDWalletProvider("a47468deab664d3ba2aec1db6787ce84", `http://eth.orbs.com`, 0, 25);
    try {
        const collector = new StatusCollector(provider);

        // we await on promises this way so that we can parallelize long-running calls
        const [vchains, {ips, addresses}] = await Promise.all([collector.queryActiveVChains(), collector.queryTopology()]);
        const [statuses, validatorData] = await Promise.all([collector.queryValidatorStatuses(vchains, ips, addresses), collector.queryValidatorsData(addresses)]);
        console.log(toTable(statuses, vchains, ips, addresses, validatorData));

    } finally {
        provider.engine.stop();
        process.exit(0);
    }
})();
