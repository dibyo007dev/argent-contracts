const etherlime = require("etherlime-lib");
const ethers = require("ethers");
const ps = require("ps-node");
const hdkey = require("ethereumjs-wallet/hdkey");
const bip39 = require("bip39");
const { signOffchain, bigNumberify } = require("./utilities.js");

const USE_ETHERLIME_GANACHE_MNEMONIC = true;

// this is the same mnemonic as that used by ganache-cli --deterministic
// this mnemonic will not be used if `USE_ETHERLIME_GANACHE_MNEMONIC` is set to `true`
const MNEMONIC = "myth like bonus scare over problem client lizard pioneer submit female collect";

class TestManager {

  constructor(_accounts = null, network = "ganache", deployer) {
    this.network = network;
    this.accounts = _accounts || this.loadAccounts();
    global.accounts = this.accounts;
    this.deployer = deployer || this.newDeployer();
    this.provider = this.deployer.provider;
  }

  loadAccounts() { // eslint-disable-line class-methods-use-this
    if (USE_ETHERLIME_GANACHE_MNEMONIC) return global.accounts;

    // ignore (global) accounts loaded from cli-commands/ganache/setup.json
    // and instead generate accounts matching those used by ganache-cli in determistic mode
    const hdWallet = hdkey.fromMasterSeed(bip39.mnemonicToSeedSync(MNEMONIC));
    const localNodeProvider = new ethers.providers.JsonRpcProvider("http://localhost:8545");
    const accounts = [];
    for (let i = 0; i < 10; i += 1) {
      const privKey = hdWallet.derivePath(`m/44'/60'/0'/0/${i}`).getWallet().getPrivateKeyString();
      accounts.push({
        secretKey: privKey,
        signer: new ethers.Wallet(privKey, localNodeProvider),
      });
    }
    return accounts;
  }

  newDeployer() {
    const defaultConfigs = {
      gasLimit: bigNumberify(20700000),
    };
    const deployerInstance = new etherlime.EtherlimeGanacheDeployer(this.accounts[0].secretKey);
    deployerInstance.setDefaultOverrides(defaultConfigs);
    return deployerInstance;
  }

  async getCurrentBlock() {
    const block = await this.provider.getBlockNumber();
    return block;
  }

  async getTimestamp(blockNumber) {
    const block = await this.provider.getBlock(blockNumber);
    return block.timestamp;
  }

  async getNonceForRelay() {
    const block = await this.provider.getBlockNumber();
    const timestamp = new Date().getTime();
    return `0x${ethers.utils.hexZeroPad(ethers.utils.hexlify(block), 16)
      .slice(2)}${ethers.utils.hexZeroPad(ethers.utils.hexlify(timestamp), 16).slice(2)}`;
  }

  setRelayerModule(relayerModule) {
    this.relayerModule = relayerModule;
  }

  async relay(_target, _method, _params, _wallet, _signers,
    _relayer = this.accounts[9].signer,
    _estimate = false,
    _gasLimit = 2000000,
    _nonce,
    _gasPrice = 0) {
    const nonce = _nonce || await this.getNonceForRelay();
    const methodData = _target.contract.interface.functions[_method].encode(_params);
    const signatures = await signOffchain(_signers, this.relayerModule.contractAddress, _target.contractAddress, 0, methodData, nonce, _gasPrice, _gasLimit);
    if (_estimate === true) {
      const gasUsed = await this.relayerModule.estimate.execute(_target.contractAddress, methodData, nonce, signatures, _gasPrice, _gasLimit);
      return gasUsed;
    }
    const tx = await this.relayerModule.execute(_target.contractAddress, methodData, nonce, signatures, _gasPrice, _gasLimit,
      { gasLimit: _gasLimit, gasPrice: _gasPrice });
    const txReceipt = await _target.verboseWaitForTransaction(tx);
    return txReceipt;
  }

  async relay_old(_target, _method, _params, _wallet, _signers,
    _relayer = this.accounts[9].signer,
    _estimate = false,
    _gasLimit = 2000000,
    _nonce,
    _gasPrice = 0) {
    const nonce = _nonce || await this.getNonceForRelay();
    const methodData = _target.contract.interface.functions[_method].encode(_params);
    const signatures = await signOffchain(_signers, _target.contractAddress, _wallet.contractAddress, 0, methodData, nonce, _gasPrice, _gasLimit);
    const targetFrom = (_target.from && _target.from(_relayer)) || _target;
    if (_estimate === true) {
      const gasUsed = await targetFrom.estimate.execute(_wallet.contractAddress, methodData, nonce, signatures, _gasPrice, _gasLimit);
      return gasUsed;
    }
    const tx = await targetFrom.execute(_wallet.contractAddress, methodData, nonce, signatures, _gasPrice, _gasLimit,
      { gasLimit: _gasLimit, gasPrice: _gasPrice });
    const txReceipt = await _target.verboseWaitForTransaction(tx);
    return txReceipt;
  }

  async increaseTime(seconds) {
    if (this.network === "ganache") {
      await this.provider.send("evm_increaseTime", seconds);
      await this.provider.send("evm_mine");
    } else {
      return new Promise((res) => { setTimeout(res, seconds * 1000); });
    }
    return null;
  }

  async runningEtherlimeGanache() { // eslint-disable-line class-methods-use-this
    return new Promise((res) => {
      ps.lookup({ arguments: ["etherlime", "ganache"] }, (err, processes) => {
        const runningEthGanache = !err && processes.reduce((etherlimeGanacheFound, p) => etherlimeGanacheFound
          || (p.command + p.arguments.join("-")).includes("etherlime-ganache"), false);
        return res(runningEthGanache);
      });
    });
  }

  async isRevertReason(error, reason) {
    const runningEthGanache = await this.runningEtherlimeGanache();
    // by default, we match the error with a generic "revert" keyword
    // but if we are running etherlime ganache (and not e.g. ganache-cli),
    // we can match the error with the exact reason message
    const expectedReason = runningEthGanache ? reason : "revert";
    return (error.message || error.toString()).includes(expectedReason);
  }
}

module.exports = TestManager;
