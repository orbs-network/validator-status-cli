#!/usr/bin/env node
const {table} = require("table");
const {queryActiveVChains,
    queryTopology,
    queryValidatorsData,
    queryValidatorStatuses,
    stop} = require("./api");

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

function toTable(results, vchains, ips, addresses, validatorsData) {
    const data = [];
    data.push(["Validator", "IP", ...vchains]);
    ips.forEach((ip, i) => {
        const vchainStatuses = results.filter(r => r.ip === ip).map(reportStatus);
        const validatorData = validatorsData[addresses[i]];
        const validatorDescription = `${validatorData.name}\nNode Address: ${validatorData.orbsAddress}\n${validatorData.website}`;
        data.push([validatorDescription, ip, ...vchainStatuses]);
    });
    return table(data);
}

(async function () {
    try {
        const [vchains, {ips, addresses}] = await Promise.all([queryActiveVChains(), queryTopology()]);
        const [statuses, validatorData] = await Promise.all([queryValidatorStatuses(vchains, ips, addresses), queryValidatorsData(addresses)]);
        console.log(toTable(statuses, vchains, ips, addresses, validatorData));

    } finally {
        stop();
    }
})();
