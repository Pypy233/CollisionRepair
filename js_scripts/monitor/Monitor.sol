// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title Monitor
 * @dev Contract for monitoring storage ownership and preventing collisions
 */
contract Monitor {
    // Struct to represent a storage context
    struct StorageContext {
        address contractAddr;  // Contract address
        address storageAddr;   // Storage address (for delegatecall)
    }

    // Struct to represent ownership of a storage slot
    struct SlotOwnership {
        address owner;         // Contract that owns the slot
        uint256 bitmask;      // Bitmask representing owned bytes (e.g. 0xfff0000 means bytes 16-18 are owned)
    }

    // Mapping from transaction sender to their call stack
    mapping(address => StorageContext[]) private callStacks;
    
    // Mapping from storage address to slot ownership info
    mapping(address => mapping(uint256 => SlotOwnership[])) private ownershipMap;

    // Events for debugging
    event OwnershipUpdated(address indexed storageAddr, uint256 slot, uint256 bitmask, address owner);
    event CollisionDetected(address indexed storageAddr, uint256 slot, uint256 bitmask, address currentOwner, address newOwner);

    /**
     * @dev Initialize ownership for a storage slot
     * @param storageAddr The address of the storage contract
     * @param slot The storage slot number
     * @param bitmask The bitmask representing owned bytes
     * @param owner The initial owner of the region
     */
    function initOwnership(
        address storageAddr,
        uint256 slot,
        uint256 bitmask,
        address owner
    ) external {
        require(owner != address(0), "Invalid owner address");
        require(bitmask != 0, "Invalid bitmask");
        
        // Check if the region is already owned
        require(!isRegionOwned(storageAddr, slot, bitmask), "Region already owned");
        
        // Add ownership record
        ownershipMap[storageAddr][slot].push(SlotOwnership({
            owner: owner,
            bitmask: bitmask
        }));
        
        emit OwnershipUpdated(storageAddr, slot, bitmask, owner);
    }

    /**
     * @dev Check if a region is already owned
     * @param storageAddr The address of the storage contract
     * @param slot The storage slot number
     * @param bitmask The bitmask representing bytes to check
     * @return bool True if the region is owned, false otherwise
     */
    function isRegionOwned(
        address storageAddr,
        uint256 slot,
        uint256 bitmask
    ) public view returns (bool) {
        SlotOwnership[] storage ownerships = ownershipMap[storageAddr][slot];
        
        for (uint256 i = 0; i < ownerships.length; i++) {
            SlotOwnership storage ownership = ownerships[i];
            
            // Check for overlap using bitwise AND
            if ((ownership.bitmask & bitmask) != 0) {
                return true;
            }
        }
        
        revert();
    }

    /**
     * @dev Check ownership and update if valid
     * @param storageAddr The address of the storage contract
     * @param slot The storage slot number
     * @param bitmask The bitmask representing bytes to check/update
     * @param newOwner The potential new owner
     * @return bool True if ownership can be updated, false if collision detected
     */
    function checkAndUpdateOwnership(
        address storageAddr,
        uint256 slot,
        uint256 bitmask,
        address newOwner
    ) external returns (bool) {
        require(newOwner != address(0), "Invalid owner address");
        require(bitmask != 0, "Invalid bitmask");
        
        // Get current call stack
        StorageContext[] storage callStack = callStacks[msg.sender];
        require(callStack.length > 0, "No active call stack");
        
        // Get current context
        StorageContext storage currentContext = callStack[callStack.length - 1];
        
        // Check if the region is already owned
        if (isRegionOwned(storageAddr, slot, bitmask)) {
            // Get the current owner
            address currentOwner = getCurrentOwner(storageAddr, slot, bitmask);
            
            // If the current owner is the same as the new owner, allow the update
            if (currentOwner == newOwner) {
                return true;
            }
            
            // Otherwise, this is a collision
            emit CollisionDetected(storageAddr, slot, bitmask, currentOwner, newOwner);
            return false;
        }
        
        // No collision, update ownership
        ownershipMap[storageAddr][slot].push(SlotOwnership({
            owner: newOwner,
            bitmask: bitmask
        }));
        
        emit OwnershipUpdated(storageAddr, slot, bitmask, newOwner);
        return true;
    }

    /**
     * @dev Get the current owner of a region
     * @param storageAddr The address of the storage contract
     * @param slot The storage slot number
     * @param bitmask The bitmask representing bytes to check
     * @return address The current owner of the region
     */
    function getCurrentOwner(
        address storageAddr,
        uint256 slot,
        uint256 bitmask
    ) public view returns (address) {
        SlotOwnership[] storage ownerships = ownershipMap[storageAddr][slot];
        
        for (uint256 i = 0; i < ownerships.length; i++) {
            SlotOwnership storage ownership = ownerships[i];
            
            // Check for overlap using bitwise AND
            if ((ownership.bitmask & bitmask) != 0) {
                return ownership.owner;
            }
        }
        
        return address(0);
    }

    /**
     * @dev Push a new context onto the call stack
     * @param contractAddr The contract address
     * @param storageAddr The storage address
     */
    function pushCallStack(address contractAddr, address storageAddr) external {
        callStacks[msg.sender].push(StorageContext({
            contractAddr: contractAddr,
            storageAddr: storageAddr
        }));
    }

    /**
     * @dev Pop the top context from the call stack
     */
    function popCallStack() external {
        StorageContext[] storage callStack = callStacks[msg.sender];
        require(callStack.length > 0, "Call stack is empty");
        callStack.pop();
    }

    /**
     * @dev Get the current context from the call stack
     * @return StorageContext The current context
     */
    function getCurrentContext() external view returns (StorageContext memory) {
        StorageContext[] storage callStack = callStacks[msg.sender];
        require(callStack.length > 0, "No active call stack");
        return callStack[callStack.length - 1];
    }

    /**
     * @dev Check if a call stack exists and is non-empty
     * @param sender The transaction sender
     * @return bool True if call stack exists and is non-empty
     */
    function hasNonEmptyCallStack(address sender) external view returns (bool) {
        return callStacks[sender].length > 0;
    }
} 