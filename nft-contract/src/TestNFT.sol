// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "openzeppelin-contracts/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

contract TestNFT is ERC721, Ownable {
    uint256 public totalMinted;
    bool public publicMintOpen;

    constructor() ERC721("Test NFT", "TNFT") Ownable(msg.sender) {}

    function setPublicMintOpen(bool open) external onlyOwner {
        publicMintOpen = open;
    }

    function mint() external {
        require(publicMintOpen, "Public mint is not open");

        totalMinted++;
        _safeMint(msg.sender, totalMinted);
    }
}
