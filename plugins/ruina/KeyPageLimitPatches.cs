namespace AtelierTweaks
{
    public static class KeyPageLimitPatches
    {
        public static void GetLimit_Postfix(BookXmlInfo __instance, ref int __result)
        {
            if (__instance == null) return;
            var target = Initializer.Config.KeyPageLimit;
            switch (__instance.Rarity)
            {
                case Rarity.Rare:
                    if (Initializer.Config.MultiplePurpleBooks && __result < target) __result = target;
                    break;
                case Rarity.Unique:
                case Rarity.Special:
                    if (Initializer.Config.MultipleGoldBooks && __result < target) __result = target;
                    break;
                case Rarity.Common:
                case Rarity.Uncommon:
                    if (Initializer.Config.MultipleCommonBooks && __result < target) __result = target;
                    break;
            }
        }

        public static void ExsistsUnique_Postfix(ref bool __result)
        {
            if (Initializer.Config.MultipleGoldBooks)
            {
                __result = false;
            }
        }
    }
}
