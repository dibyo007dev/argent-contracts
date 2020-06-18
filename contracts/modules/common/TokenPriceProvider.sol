// Copyright (C) 2018  Argent Labs Ltd. <https://argent.xyz>

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.6.10;
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../../lib/other/IERC20Extended.sol";
import "../../infrastructure/base/Managed.sol";

contract TokenPriceProvider is Managed {
    using SafeMath for uint256;

    mapping(address => uint256) public cachedPrices;

    /**
     * @dev Converts the value of _amount tokens in ether.
     * @param _amount the amount of tokens to convert (in 'token wei' twei)
     * @param _token the token address
     * @return the ether value (in wei) of _amount tokens with contract _token
     */
    function getEtherValue(uint256 _amount, address _token) external view returns (uint256) {
        uint256 decimals;

        try IERC20Extended(_token).decimals() returns (uint _decimals) {
            decimals = _decimals;
        }
        catch (bytes memory /*lowLevelData*/) {
        }

        uint256 price = cachedPrices[_token];
        uint256 etherValue = decimals == 0 ? price.mul(_amount) : price.mul(_amount).div(10**decimals);
        return etherValue;
    }

    function setPriceForTokenList(address[] calldata _tokens, uint256[] calldata _prices) external onlyManager {
        for (uint16 i = 0; i < _tokens.length; i++) {
            setPrice(_tokens[i], _prices[i]);
        }
    }

    function setPrice(address _token, uint256 _price) public onlyManager {
        cachedPrices[_token] = _price;
    }
}