using System;
using System.Reflection;
using HarmonyLib;
using LOR_DiceSystem;
using UnityEngine;

namespace AtelierTweaks
{
    public class Initializer : ModInitializer
    {
        internal static TweaksConfig Config = new TweaksConfig();

        [ThreadStatic]
        internal static bool InBattleBonusReward;

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

            if (Config.NoGrindBooks || Config.NoGrindBurnCards)
            {
                PatchMethod(
                    harmony,
                    typeof(StageController).GetMethod("BonusRewardWithPopup", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic),
                    prefix: typeof(NoGrindPatches).GetMethod(nameof(NoGrindPatches.BonusReward_Prefix)),
                    finalizer: typeof(NoGrindPatches).GetMethod(nameof(NoGrindPatches.BonusReward_Finalizer))
                );
            }

            if (Config.NoGrindBooks)
            {
                PatchMethod(
                    harmony,
                    typeof(StageController).GetMethod("OnEnemyDropBookForAdded", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic),
                    prefix: typeof(NoGrindPatches).GetMethod(nameof(NoGrindPatches.OnEnemyDropBookForAdded_Prefix))
                );
                PatchMethod(
                    harmony,
                    typeof(DropBookInventoryModel).GetMethod("AddBook", new[] { typeof(int), typeof(int) }),
                    prefix: typeof(NoGrindPatches).GetMethod(nameof(NoGrindPatches.AddBookInt_Prefix))
                );
            }

            if (Config.NoGrindBurnCards)
            {
                PatchMethod(
                    harmony,
                    typeof(LibraryFloorModel).GetMethod("FeedBook", BindingFlags.Instance | BindingFlags.Public),
                    prefix: typeof(NoGrindPatches).GetMethod(nameof(NoGrindPatches.FeedBook_Prefix)),
                    finalizer: typeof(NoGrindPatches).GetMethod(nameof(NoGrindPatches.FeedBook_Finalizer))
                );
                PatchMethod(
                    harmony,
                    typeof(InventoryModel).GetMethod("AddCard", new[] { typeof(LorId), typeof(int) }),
                    prefix: typeof(NoGrindPatches).GetMethod(nameof(NoGrindPatches.AddCardLorId_Prefix))
                );
                PatchMethod(
                    harmony,
                    typeof(DiceCardXmlInfo).GetMethod("get_Limit", BindingFlags.Instance | BindingFlags.Public),
                    postfix: typeof(NoGrindPatches).GetMethod(nameof(NoGrindPatches.CardLimit_Postfix))
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
}
