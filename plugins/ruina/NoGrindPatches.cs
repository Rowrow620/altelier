using System.Collections.Generic;

namespace AtelierTweaks
{
    public static class NoGrindPatches
    {
        public static bool OnEnemyDropBookForAdded_Prefix(DropBookDataForAddedReward __0, List<DropBookDataForAddedReward> ____droppedbookdatas)
        {
            if (!Initializer.Config.NoGrindBooks || __0 == null) return true;
            ____droppedbookdatas?.Add(__0);
            Singleton<DropBookInventoryModel>.Instance.AddBook(__0.GetLorId(), Initializer.Config.NoGrindAmount);
            return false;
        }

        public static void BonusReward_Prefix() => Initializer.InBattleBonusReward = true;
        public static void BonusReward_Finalizer() => Initializer.InBattleBonusReward = false;

        public static void AddBookInt_Prefix(ref int __1)
        {
            if (Initializer.Config.NoGrindBooks && Initializer.InBattleBonusReward && __1 > 0 && __1 < Initializer.Config.NoGrindAmount)
            {
                __1 = Initializer.Config.NoGrindAmount;
            }
        }

        public static void FeedBook_Prefix() => Initializer.InFeedBook = true;
        public static void FeedBook_Finalizer() => Initializer.InFeedBook = false;

        public static void AddCardLorId_Prefix(ref int __1)
        {
            if (Initializer.Config.NoGrindBurnCards && (Initializer.InFeedBook || Initializer.InBattleBonusReward) && __1 > 0 && __1 < Initializer.Config.NoGrindAmount)
            {
                __1 = Initializer.Config.NoGrindAmount;
            }
        }

        public static void CardLimit_Postfix(ref int __result)
        {
            if (Initializer.Config.NoGrindBurnCards && Initializer.InFeedBook && __result < Initializer.Config.NoGrindAmount)
            {
                __result = Initializer.Config.NoGrindAmount;
            }
        }
    }
}
