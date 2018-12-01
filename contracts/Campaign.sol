pragma solidity ^0.4.23;

contract CampaignContract {
  address private admin; // the owner of the contract i.e the adminstrator

  struct Campaign {
  uint256 startDate;
  uint256 endDate;
  uint256 totalBudget; // in WEI
  uint256 rewardAmount; // in WEI
  bool isCampaign;
  address[] rewarded;
  }

  mapping (address => Campaign) private campaigns;
  address[] public campaignAddressesList;

  mapping (address => uint) balance;

  event CampaignActive(uint256 startDate, uint256 now, uint256 endDate, address campaignAddress);
  event CampaignCreated(uint256 startDate, uint256 endDate, address retailer, uint256 totalBudget, uint256 rewardAmount);
  event ShopperRewarded(address from, address to);
  event ContractFunded(address from, uint256 amount);
  event FundsReleased(address retailer, uint256 amount);

  function createCampaign(uint256 startDate, uint256 endDate, uint256 rewardAmount)
   public payable returns(uint rowNumber){
     address campaignAddress=msg.sender;
     uint256 budget=msg.value;
     require(campaigns[campaignAddress].isCampaign==false);
     require(budget>rewardAmount);
       campaigns[campaignAddress].startDate = startDate;
       campaigns[campaignAddress].endDate = endDate;
       campaigns[campaignAddress].totalBudget = budget;
       campaigns[campaignAddress].rewardAmount = rewardAmount;
       campaigns[campaignAddress].isCampaign = true;
       delete campaigns[campaignAddress].rewarded;
       emit CampaignCreated(startDate, endDate, campaignAddress, budget, rewardAmount);
       balance[msg.sender] += msg.value;
       emit ContractFunded(msg.sender, campaigns[msg.sender].totalBudget);
       return campaignAddressesList.push(campaignAddress) - 1;
   }

  modifier campaignExists(address campaignAddress, bool exists){
      require(campaigns[campaignAddress].isCampaign==exists);
      _;
  }

  modifier campaignHasFunds(address campaignAddress) {
    require(campaigns[campaignAddress].rewardAmount < balance[campaignAddress]);
    _;
  }

  function isActive(address campaignAddress) public view
      campaignExists(campaignAddress, true)
      campaignHasFunds(campaignAddress)
      returns(bool campaignIsActive) {
    return(campaigns[campaignAddress].startDate < now && campaigns[campaignAddress].endDate > now);
  }

  function getActiveCampaigns() public view returns(address[] addressesList) {
    address[] memory activeCampaignsList = new address[](campaignAddressesList.length);
    uint32 counter = 0;
    for(uint32 i=0; i<campaignAddressesList.length;i++ ) {
      if(campaigns[campaignAddressesList[i]].isCampaign && isActive(campaignAddressesList[i])) {
        activeCampaignsList[counter]=campaignAddressesList[i];
        counter++;
      }
    }
    return activeCampaignsList;
  }

  function terminateCampaign(address retailer) public {
    releaseFunds(retailer);
    require(balance[retailer]==0); // Keep track of the campaign if there are remaining funds
    campaigns[retailer].isCampaign = false; // Reset to allow the retailer to create a new campaign
  }

  function releaseFunds(address retailer) internal campaignExists(retailer,true){
    uint256 retailerBalance = balance[retailer];
    require(retailerBalance>0);
    retailer.transfer(retailerBalance);
    balance[retailer] = 0; // Set balance to 0 to prevent double transfer
    emit FundsReleased(retailer,retailerBalance);
    }

  function shopperHasNotBeenRewarded(address _to, address _from) view returns(bool notRewarded) {
    Campaign storage currentCampaign = campaigns[_from];
      for(uint32 i=0; i<currentCampaign.rewarded.length;i++) {
        if(currentCampaign.rewarded[i]==_to) {
          return false;
        }
      }
      return true;
  }

  function rewardShopper(address _to) public {
    address retailer = msg.sender;
    uint256 reward = campaigns[retailer].rewardAmount;
    if(balance[retailer]<reward) {
      terminateCampaign(msg.sender);
    }
    else {
      require(isActive(retailer));
      require(shopperHasNotBeenRewarded(_to,retailer));
      _to.transfer(reward);
      campaigns[retailer].rewarded.push(_to);
      balance[retailer] -= reward;
      emit ShopperRewarded(retailer, _to);
      }
  }

  function checkCampaignsValidity() public {
    for(uint32 i=0;i<campaignAddressesList.length;i++) {
      if((campaigns[campaignAddressesList[i]].endDate < now) && (campaigns[campaignAddressesList[i]].isCampaign==true)) {
        terminateCampaign(campaignAddressesList[i]);
      }
    }
  }

  function getBalance(address retailer) view public returns(uint retailerBalance){
    return balance[retailer];
  }

  /* Sets the address creating the contract as the contract admin */
  constructor() public {
    admin = msg.sender;
  }
}
