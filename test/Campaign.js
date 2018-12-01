const Campaign = artifacts.require('./Campaign.sol');

contract('Campaign', function(accounts) {
    let campaignContract;
    let campaign;
    const contractOwner = accounts[0];
    const accountRetailer = accounts[1];
    const accountAnotherRetailer = accounts[2];
    const accountRetailerNOTActive = accounts[3];
    const accountShopper = accounts[4];
    const anotherShopper = accounts[5];

    const getTimestamp = date => Math.round(date.getTime() / 1000);
    const startDate = getTimestamp(new Date(2016, 1, 1, 0, 0, 0, 0));
    const futureStartDate = getTimestamp(new Date(2019, 1, 1, 0, 0, 0, 0));
    const endDate = getTimestamp(new Date(2019, 12, 31, 59, 59, 59, 9));

    const reward = web3.toWei(0.1, 'ether');
    const budget = web3.toWei(0.5, 'ether');

    describe('Contract functions', () => {
        beforeEach('setup contract for each test', async function() {
            campaignContract = await Campaign.new();
            campaign = await campaignContract.createCampaign(startDate, endDate, reward, {
                from: accountRetailer,
                value: budget
            });
        });

        it('should create a campaign', async () => {
            let campaignEvent = campaign.logs[0];
            assert.equal(campaignEvent.event, 'CampaignCreated');
            assert.equal(campaignEvent.args.startDate.toNumber(), startDate);
            assert.equal(campaignEvent.args.endDate.toNumber(), endDate);
            assert.equal(campaignEvent.args.retailer, accountRetailer);
        });

        it('should NOT create a campaign', async () => {
            let anotherCampaign;
            try {
                anotherCampaign = await campaignContract.createCampaign(startDate, endDate, reward, {
                    from: accountRetailer,
                    value: budget
                });
            } catch (error) {
                assert.isTrue(error.message.includes('revert'));
            } finally {
                assert.equal(typeof anotherCampaign, 'undefined');
            }
        });

        it('should be an active campaign', async () => {
            let isActive = await campaignContract.isActive(accountRetailer);
            assert.isTrue(isActive);
        });

        it('should NOT be an active campaign', async () => {
            let nonActiveCampaign = await campaignContract.createCampaign(futureStartDate, endDate, reward, {
                from: accountRetailerNOTActive,
                value: budget
            });
            let isActive = await campaignContract.isActive(accountRetailerNOTActive);
            assert.isFalse(isActive);
        });

        it('should get all active campaign addresses', async () => {
            let preAddressesList = await campaignContract.getActiveCampaigns({
                from: contractOwner
            });
            assert.equal(preAddressesList.length, 1);
            let campaign = await campaignContract.createCampaign(startDate, endDate, reward, {
                from: accounts[4],
                value: budget
            });
            let postAddressesList = await campaignContract.getActiveCampaigns({
                from: contractOwner
            });
            assert.equal(postAddressesList.length, 2);
            let nonActiveCampaign = await campaignContract.createCampaign(futureStartDate, endDate, reward, {
                from: accountRetailerNOTActive,
                value: budget
            });
            let lastAddressesList = await campaignContract.getActiveCampaigns({
                from: contractOwner
            });
            assert.equal(postAddressesList.length, 2);
        });

        it('should deposit money to contract', async () => {
            let fundingEvent = campaign.logs[1];
            assert.equal(fundingEvent.event, 'ContractFunded');
            assert.equal(fundingEvent.args.from, accountRetailer);
            assert.equal(web3.eth.getBalance(campaignContract.address).toString(), budget);
        });

        it('should NOT deposit money to contract', async () => {
            let anotherCampaign;
            try {
                anotherCampaign = await campaignContract.createCampaign(startDate, endDate, reward, {
                    from: accountRetailer,
                    value: reward - 1 //not enough funds to reward anyone
                });
            } catch (error) {
                assert.isTrue(error.message.includes('revert'));
            } finally {
                assert.equal(typeof anotherCampaign, 'undefined');
            }
            assert.equal(web3.eth.getBalance(campaignContract.address).toString(), budget); // budget is provided in beforeEach
        });

        it('should reward shopper', async () => {
            let balance = await campaignContract.getBalance(accountRetailer);
            assert.equal(web3.eth.getBalance(campaignContract.address).toString(), budget);
            let shopperRewarded = await campaignContract.rewardShopper(accountShopper, { from: accountRetailer });
            balance = await campaignContract.getBalance(accountRetailer);
            assert.equal(balance.toNumber(), budget - reward);
            let rewardEvent = shopperRewarded.logs[0];
            assert.equal(rewardEvent.event, 'ShopperRewarded');
            assert.equal(web3.eth.getBalance(campaignContract.address).toString(), budget - reward);
            assert.equal(rewardEvent.args.from, accountRetailer);
            assert.equal(rewardEvent.args.to, accountShopper);
        });

        it('should NOT reward shopper if the campaigns runs out of money; should release funds', async () => {
            campaign = await campaignContract.createCampaign(startDate, endDate, 5 * reward, {
                from: accountAnotherRetailer,
                value: 6 * reward
            });
            let shopperRewarded = await campaignContract.rewardShopper(accountShopper, {
                from: accountAnotherRetailer
            });
            let balance = await campaignContract.getBalance(accountAnotherRetailer);
            assert.equal(balance.toNumber(), reward);
            let shopperNotRewarded;
            try {
                shopperNotRewarded = await campaignContract.rewardShopper(anotherShopper, {
                    from: accountAnotherRetailer
                });
            } catch (error) {
                assert.isTrue(error.message.includes('revert'));
            } finally {
                assert.equal(shopperNotRewarded.logs[0].event, 'FundsReleased');
            }
            balance = await campaignContract.getBalance(accountAnotherRetailer);
            assert.equal(balance.toNumber(), 0);
        });

        it('should NOT reward shopper a second time', async () => {
            let shopperRewarded = await campaignContract.rewardShopper(accountShopper, {
                from: accountRetailer
            });
            let remainingFunds = budget - reward;
            let shopperNotRewarded;
            try {
                shopperNotRewarded = await campaignContract.rewardShopper(accountShopper, {
                    from: accountRetailer
                });
            } catch (error) {
                assert.isTrue(error.message.includes('revert'));
            } finally {
                assert.equal(typeof shopperNotRewarded, 'undefined');
            }
            balance = await campaignContract.getBalance(accountRetailer);
            assert.equal(balance.toNumber(), remainingFunds);
            assert.equal(web3.eth.getBalance(campaignContract.address).toString(), remainingFunds);
        });

        it('should make active campaign become inactive', async () => {
            campaign = await campaignContract.createCampaign(startDate, startDate + 1, reward, {
                from: accountAnotherRetailer,
                value: budget
            });
            let checkCampaigns = await campaignContract.checkCampaignsValidity({
                from: contractOwner
            });
            let balance = await campaignContract.getBalance(accountAnotherRetailer);
            assert.equal(balance.toNumber(), 0);
        });
    });
});
