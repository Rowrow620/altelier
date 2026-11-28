using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using HarmonyLib;
using LOR_DiceSystem;
using UnityEngine;

namespace AtelierTweaks
{
    public sealed class TweaksConfig
    {
        public bool NoGrindBooks;
        public bool NoGrindBurnCards;
        public int NoGrindAmount = 10;
        public bool MultiplePurpleBooks;
        public bool MultipleGoldBooks;
        public bool MultipleCommonBooks;
        public int KeyPageLimit = 99;

        public static TweaksConfig Load(string assemblyLocation)
        {
            var cfg = new TweaksConfig();
            try
            {
                if (string.IsNullOrEmpty(assemblyLocation)) return cfg;
                var asmDir = Path.GetDirectoryName(assemblyLocation);
                var modRoot = asmDir != null ? Path.GetDirectoryName(asmDir) : null;
                string[] candidates = {
                    asmDir != null ? Path.Combine(asmDir, "tweaks.cfg") : null,
                    modRoot != null ? Path.Combine(modRoot, "tweaks.cfg") : null,
                };
                foreach (var path in candidates)
                {
                    if (string.IsNullOrEmpty(path) || !File.Exists(path)) continue;
                    foreach (var raw in File.ReadAllLines(path))
                    {
                        var line = raw.Trim();
                        if (line.Length == 0 || line.StartsWith("#")) continue;
                        var eq = line.IndexOf('=');
                        if (eq <= 0) continue;
                        var key = line.Substring(0, eq).Trim();
                        var val = line.Substring(eq + 1).Trim();
                        if (key.Equals("NoGrindBooks", StringComparison.OrdinalIgnoreCase) || key.Equals("NoGrindDrops", StringComparison.OrdinalIgnoreCase))
                            cfg.NoGrindBooks = IsTrue(val);
                        else if (key.Equals("NoGrindBurnCards", StringComparison.OrdinalIgnoreCase))
                            cfg.NoGrindBurnCards = IsTrue(val);
                        else if (key.Equals("NoGrindAmount", StringComparison.OrdinalIgnoreCase) && int.TryParse(val, out var amt) && amt >= 0 && amt <= 99)
                            cfg.NoGrindAmount = amt;
                        else if (key.Equals("MultiplePurpleBooks", StringComparison.OrdinalIgnoreCase))
                            cfg.MultiplePurpleBooks = IsTrue(val);
                        else if (key.Equals("MultipleGoldBooks", StringComparison.OrdinalIgnoreCase))
                            cfg.MultipleGoldBooks = IsTrue(val);
                        else if (key.Equals("MultipleCommonBooks", StringComparison.OrdinalIgnoreCase))
                            cfg.MultipleCommonBooks = IsTrue(val);
                        else if (key.Equals("KeyPageLimit", StringComparison.OrdinalIgnoreCase) && int.TryParse(val, out var lim) && lim > 0)
                            cfg.KeyPageLimit = lim;
                    }
                    break;
                }
            }
            catch (Exception ex)
            {
                Debug.LogError("[AtelierTweaks] Config load failed: " + ex);
            }
            return cfg;
        }

        private static bool IsTrue(string val) =>
            val.Equals("true", StringComparison.OrdinalIgnoreCase) || val == "1";
    }

    public class Initializer : ModInitializer
    {
        internal static TweaksConfig Config = new TweaksConfig();

        [ThreadStatic]
        internal static bool InFeedBook;

        public override void OnInitializeMod()
        {
            Config = TweaksConfig.Load(typeof(Initializer).Assembly.Location);
            if (!Config.NoGrindBooks && !Config.NoGrindBurnCards && !Config.MultiplePurpleBooks && !Config.MultipleGoldBooks && !Config.MultipleCommonBooks)
            {
                Debug.Log("[AtelierTweaks] Loaded with all tweaks disabled.");
                return;
            }

            var harmony = new Harmony("com.rowrow620.atelier.tweaks");

            if (Config.NoGrindBooks)
            {
                PatchMethod(
                    harmony,
                    typeof(StageController).GetMethod("OnEnemyDropBookForAdded", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic),
                    prefix: typeof(RewardPatches).GetMethod(nameof(RewardPatches.OnEnemyDropBookForAdded_Prefix))
                );
            }

            if (Config.NoGrindBurnCards)
            {
                PatchMethod(
                    harmony,
                    typeof(LibraryFloorModel).GetMethod("FeedBook", BindingFlags.Instance | BindingFlags.Public),
                    prefix: typeof(RewardPatches).GetMethod(nameof(RewardPatches.FeedBook_Prefix)),
                    postfix: typeof(RewardPatches).GetMethod(nameof(RewardPatches.FeedBook_Postfix)),
                    finalizer: typeof(RewardPatches).GetMethod(nameof(RewardPatches.FeedBook_Finalizer))
                );
                PatchMethod(
                    harmony,
                    typeof(InventoryModel).GetMethod("AddCard", new[] { typeof(LorId), typeof(int) }),
                    prefix: typeof(RewardPatches).GetMethod(nameof(RewardPatches.AddCardLorId_Prefix))
                );
                PatchMethod(
                    harmony,
                    typeof(DiceCardXmlInfo).GetMethod("get_Limit", BindingFlags.Instance | BindingFlags.Public),
                    postfix: typeof(RewardPatches).GetMethod(nameof(RewardPatches.CardLimit_Postfix))
                );
            }

            if (Config.MultiplePurpleBooks || Config.MultipleGoldBooks || Config.MultipleCommonBooks)
            {
                PatchMethod(
                    harmony,
                    typeof(BookXmlInfo).GetMethod("get_Limit", BindingFlags.Instance | BindingFlags.Public),
                    postfix: typeof(KeyPageLimitPatches).GetMethod(nameof(KeyPageLimitPatches.GetLimit_Postfix))
                );
            }

            if (Config.MultipleGoldBooks)
            {
                PatchMethod(
                    harmony,
                    typeof(LibraryFloorModel).GetMethod("ExsistsUnique", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic),
                    postfix: typeof(KeyPageLimitPatches).GetMethod(nameof(KeyPageLimitPatches.ExsistsUnique_Postfix))
                );
            }

            Debug.Log("[AtelierTweaks] Initialized (" +
                $"NoGrindBooks={Config.NoGrindBooks}, NoGrindBurnCards={Config.NoGrindBurnCards}, " +
                $"Purple={Config.MultiplePurpleBooks}, Gold={Config.MultipleGoldBooks}, Common={Config.MultipleCommonBooks})");
        }

        internal static void PatchMethod(Harmony harmony, MethodBase target, MethodInfo prefix = null, MethodInfo postfix = null, MethodInfo finalizer = null)
        {
            if (target == null) throw new MissingMethodException("AtelierTweaks target method not found");
            harmony.Patch(
                target,
                prefix: prefix != null ? new HarmonyMethod(prefix) : null,
                postfix: postfix != null ? new HarmonyMethod(postfix) : null,
                transpiler: null,
                finalizer: finalizer != null ? new HarmonyMethod(finalizer) : null
            );
        }
    }

    public static class RewardPatches
    {
        public static bool OnEnemyDropBookForAdded_Prefix(DropBookDataForAddedReward __0, List<DropBookDataForAddedReward> ____droppedbookdatas)
        {
            if (!Initializer.Config.NoGrindBooks || __0 == null) return true;
            if (Initializer.Config.NoGrindAmount == 0) return false;
            ____droppedbookdatas?.Add(__0);
            Singleton<DropBookInventoryModel>.Instance.AddBook(__0.GetLorId(), Initializer.Config.NoGrindAmount);
            return false;
        }

        public static void FeedBook_Prefix() => Initializer.InFeedBook = true;
        public static void FeedBook_Finalizer() => Initializer.InFeedBook = false;

        public static void FeedBook_Postfix(List<BookDropResult> __result)
        {
            if (Initializer.Config.NoGrindBurnCards && Initializer.Config.NoGrindAmount == 0)
            {
                __result?.RemoveAll(reward => reward.itemType == DropItemType.Card);
            }
        }

        public static bool AddCardLorId_Prefix(ref int __1)
        {
            if (!Initializer.Config.NoGrindBurnCards || !Initializer.InFeedBook || __1 <= 0) return true;
            if (Initializer.Config.NoGrindAmount == 0) return false;
            __1 = Initializer.Config.NoGrindAmount;
            return true;
        }

        public static void CardLimit_Postfix(ref int __result)
        {
            if (Initializer.Config.NoGrindBurnCards && Initializer.InFeedBook && __result < Initializer.Config.NoGrindAmount)
            {
                __result = Initializer.Config.NoGrindAmount;
            }
        }
    }

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
