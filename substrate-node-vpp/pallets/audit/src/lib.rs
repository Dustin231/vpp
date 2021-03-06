#![cfg_attr(not(feature = "std"), no_std)]

use frame_support::{
	decl_module, decl_storage, decl_event, decl_error, dispatch, 
	traits::{Currency},
};
use frame_system::{self as system, ensure_signed};
use sp_std::prelude::*;
use codec::{Encode, Decode};
use primitives::{TypeTransfer, Parliament, StakeStatus, Role, DEPOSIT_AMOUNT};

#[cfg(test)]
mod mock;

#[cfg(test)]
mod tests;

pub trait Trait: system::Trait {
	type Event: From<Event<Self>> + Into<<Self as system::Trait>::Event>;
	type Currency: Currency<Self::AccountId>;
	type TypeTransfer: TypeTransfer<Self::AccountId>;
	type Parliament: Parliament<Self::AccountId>;
	type Role: Role<Self::AccountId>;
}

#[cfg_attr(feature = "std", derive(Debug, PartialEq, Eq))]
#[derive(Encode, Decode)]
pub struct ProposalInfo<T: Trait> {
	pub apply_addr: T::AccountId,			  	  //申请者地址
	pub apply_role: u8,							   			//申请角色（0:pu, 1:pg，2:ps，3:sg，4:ass）
	pub apply_status: u8,								 //提案状态（0：待通过，1：已通过，2：已拒绝）
	pub apply_annex: bool,					 		  //附件情况（0：无附件，1：有附件）
}

// This pallet's storage items.
decl_storage! {
	trait Store for Module<T: Trait> as TemplateModule {
		pub ProposalCount get(fn proposalcount):  u32;
		pub ProposalInformation get(fn proposalinformation):  map hasher(blake2_128_concat) u32 => Option<ProposalInfo<T>>;
	}
}

// The pallet's events
decl_event!(
	pub enum Event<T> where AccountId = <T as system::Trait>::AccountId {
		SomethingStored(u32, AccountId),
	}
);

// The pallet's errors
decl_error! {
	pub enum Error for Module<T: Trait> {
		ProposalNotExist,
		Overflow,
	}
}

// The pallet's dispatchable functions.
decl_module! {
	/// The module declaration.
	pub struct Module<T: Trait> for enum Call where origin: T::Origin {
		type Error = Error<T>;

		fn deposit_event() = default;

		#[weight = 0]
		pub fn applyproposalrole(
			origin, 
			apply_role: u8, 
			apply_annex: bool
		) -> dispatch::DispatchResult{
			let sender = ensure_signed(origin)?;

			match apply_role {
				2 => T::TypeTransfer::staketransfer(&sender, DEPOSIT_AMOUNT, StakeStatus::Deposit)?,
				_ => (),
			}

			let proposal_number = ProposalCount::get();
			let proposal_template = ProposalInfo::<T> {
				apply_addr: sender.clone(),
				apply_role: apply_role,
				apply_status: 0,
				apply_annex: apply_annex,
			};

			let proposal_number_next = proposal_number.checked_add(1).ok_or(Error::<T>::Overflow)?;
			ProposalCount::put(proposal_number_next);			

			ProposalInformation::insert(proposal_number, proposal_template);

			Ok(())
		}

		#[weight = 0]
		pub fn applyproposalcancelrole(
			origin, 
			apply_role: u8, 
			apply_annex: bool
		) -> dispatch::DispatchResult{
			let sender = ensure_signed(origin)?;

			match apply_role {
				2 => T::TypeTransfer::staketransfer(&sender, DEPOSIT_AMOUNT, StakeStatus::TakeDeposit)?,
				_ => (),
			}

			T::Role::do_apply_cancel(sender, apply_role)?;

			Ok(())
		}

		#[weight = 0]
		pub fn setproposalrole(
			origin, 
			proposal_number: u32, 
			vote_result: u8
		) -> dispatch::DispatchResult{
			let sender = ensure_signed(origin)?;

			//检查当前sender是否为委员会成员
			if T::Parliament::is_member(&sender) {
				let mut proposal_information = <ProposalInformation<T>>::get(proposal_number).ok_or(Error::<T>::ProposalNotExist)?;
				proposal_information.apply_status = vote_result;

				match vote_result {
					1 => T::Role::do_apply(proposal_information.apply_addr.clone(), proposal_information.apply_role)?,
					2 => T::TypeTransfer::staketransfer(&sender, DEPOSIT_AMOUNT, StakeStatus::TakeDeposit)?,
					_ => (),
				}

				ProposalInformation::insert(proposal_number, proposal_information);				
			}
			Ok(())
		}

	}
}
