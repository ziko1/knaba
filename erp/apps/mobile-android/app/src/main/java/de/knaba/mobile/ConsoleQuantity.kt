package de.knaba.mobile

import java.math.BigDecimal

/** Exact conversion at the native form boundary; quantities are thousandths in the ERP. */
internal object ConsoleQuantity {
    private const val MAX_SAFE_INTEGER = 9_007_199_254_740_991L
    fun parse(text: String, minimum: Long = 0, maximum: Long = MAX_SAFE_INTEGER): Long {
        val raw = text.trim()
        require(raw.matches(Regex("-?[0-9]+([.,][0-9]{1,3})?")))
        val amount = BigDecimal(raw.replace(',', '.'))
        require(amount.scale() <= 3)
        val milli = amount.multiply(BigDecimal(1000)).longValueExact()
        require(milli in minimum..maximum && milli in -MAX_SAFE_INTEGER..MAX_SAFE_INTEGER)
        return milli
    }
    fun display(value: Long): String = BigDecimal.valueOf(value, 3).stripTrailingZeros().toPlainString()
}
