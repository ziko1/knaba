package de.knaba.mobile

import android.app.Activity
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.graphics.drawable.StateListDrawable
import android.view.Gravity
import android.view.View
import android.view.WindowInsetsController
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView

/** Native adaptation of the current corporate-site global.css / portal.css tokens. */
object KnabaTheme {
    val ink = Color.rgb(16, 47, 56)
    val text = Color.rgb(20, 52, 59)
    val muted = Color.rgb(85, 107, 109)
    val deep = Color.rgb(17, 50, 59)
    val teal = Color.rgb(7, 95, 99)
    val lime = Color.rgb(216, 247, 121)
    val paper = Color.rgb(251, 252, 247)
    val line = Color.rgb(216, 224, 219)
    val soft = Color.rgb(239, 243, 234)
    val green = Color.rgb(227, 239, 222)
    val lilac = Color.rgb(232, 226, 248)
    val coral = Color.rgb(247, 227, 216)
    val error = Color.rgb(142, 48, 35)
    val inputBorder = Color.rgb(110, 137, 137)

    fun dp(context: Context, value: Int) = (value * context.resources.displayMetrics.density).toInt()

    fun surface(context: Context, color: Int = Color.WHITE, radius: Int = 18, border: Int? = null) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(context, radius).toFloat()
        if (border != null) setStroke(dp(context, 1), border)
    }

    fun hero(context: Context) = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(deep, Color.rgb(20, 72, 79))).apply {
        cornerRadius = dp(context, 26).toFloat()
    }

    fun configureWindow(activity: Activity) {
        activity.window.decorView.setBackgroundColor(paper)
        activity.window.insetsController?.setSystemBarsAppearance(
            WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
            WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
        )
    }

    fun applyButton(button: Button, primary: Boolean = false) = button.apply {
        isAllCaps = false
        textSize = 15f
        typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        minHeight = dp(context, 52)
        minimumHeight = dp(context, 52)
        stateListAnimator = null
        setTextColor(ColorStateList(arrayOf(intArrayOf(-android.R.attr.state_enabled), intArrayOf()), intArrayOf(muted, if (primary) Color.WHITE else ink)))
        val states = StateListDrawable().apply {
            addState(intArrayOf(-android.R.attr.state_enabled), surface(context, soft, 16, line))
            addState(intArrayOf(android.R.attr.state_focused), surface(context, if (primary) deep else lime, 16, teal))
            addState(intArrayOf(), surface(context, if (primary) teal else Color.WHITE, 16, if (primary) null else line))
        }
        background = RippleDrawable(ColorStateList.valueOf(Color.argb(35, 7, 95, 99)), states, surface(context, Color.WHITE, 16))
        setPadding(dp(context, 16), dp(context, 12), dp(context, 16), dp(context, 12))
    }

    fun applyInput(edit: EditText) = edit.apply {
        textSize = 16f
        setTextColor(ink)
        setHintTextColor(muted)
        minHeight = dp(context, 54)
        background = StateListDrawable().apply {
            addState(intArrayOf(android.R.attr.state_focused), surface(context, Color.WHITE, 14, teal).apply { setStroke(dp(context, 2), teal) })
            addState(intArrayOf(), surface(context, Color.WHITE, 14, inputBorder))
        }
        setPadding(dp(context, 14), dp(context, 14), dp(context, 14), dp(context, 14))
    }

    fun label(context: Context, value: String, size: Float = 15f, color: Int = text) = TextView(context).apply {
        text = value
        textSize = size
        setTextColor(color)
        setLineSpacing(dp(context, 2).toFloat(), 1f)
    }

    fun wordmark(context: Context) = ImageView(context).apply {
        setImageResource(R.drawable.knaba_wordmark)
        scaleType = ImageView.ScaleType.FIT_START
        adjustViewBounds = true
        contentDescription = "KNABA DE"
        layoutParams = LinearLayout.LayoutParams(dp(context, 208), dp(context, 52)).apply { bottomMargin = dp(context, 20) }
    }

    fun content(context: Context): LinearLayout = object : LinearLayout(context) {
        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            val width = View.MeasureSpec.getSize(widthMeasureSpec).coerceAtMost(dp(context, 760))
            super.onMeasure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.getMode(widthMeasureSpec)), heightMeasureSpec)
        }
    }.apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.TOP
        setPadding(dp(context, 20), dp(context, 20), dp(context, 20), dp(context, 32))
    }
}
